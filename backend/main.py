from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import create_engine, Column, Integer, String, Boolean
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from pydantic import BaseModel, EmailStr
import bcrypt
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional
import smtplib
from email.message import EmailMessage
import os

# Database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./reelcast.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Models
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    display_name = Column(String)
    hashed_password = Column(String)
    is_email_verified = Column(Boolean, default=False)

Base.metadata.create_all(bind=engine)

# Security config
SECRET_KEY = "supersecretkey" # In production, use environment variables
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Schemas
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    display_name: str

class UserResponse(BaseModel):
    id: int
    email: str
    display_name: str
    is_email_verified: bool
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class VerifyEmailRequest(BaseModel):
    token: str

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

from dotenv import load_dotenv

# Load env variables before OAuth setup
load_dotenv(".env.local")
load_dotenv()

from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request
from starlette.responses import RedirectResponse
from authlib.integrations.starlette_client import OAuth, OAuthError

# App setup
app = FastAPI(title="ReelCast Auth API")

app.add_middleware(SessionMiddleware, secret_key="supersecret-session-key")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"], # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Email Settings
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")

def send_verification_email(email_to: str, token: str):
    if not SMTP_USERNAME or not SMTP_PASSWORD:
        print("SMTP_USERNAME or SMTP_PASSWORD not set. Email will only be printed to console.")
        return

    msg = EmailMessage()
    msg['Subject'] = 'Verify your ReelCast Account'
    msg['From'] = SMTP_USERNAME
    msg['To'] = email_to
    
    verify_url = f"http://localhost:3000/verify-email?token={token}"
    msg.set_content(f"Welcome to ReelCast!\n\nPlease verify your email by clicking the link below:\n\n{verify_url}")

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)
            print(f"[{email_to}] Verification email sent successfully!")
    except Exception as e:
        print(f"Failed to send email to {email_to}: {e}")

# OAuth Setup
oauth = OAuth()
oauth.register(
    name='google',
    client_id=os.getenv("GOOGLE_CLIENT_ID", "dummy-client-id"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET", "dummy-client-secret"),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'}
)

oauth.register(
    name='facebook',
    client_id=os.getenv("FACEBOOK_CLIENT_ID", "dummy-client-id"),
    client_secret=os.getenv("FACEBOOK_CLIENT_SECRET", "dummy-client-secret"),
    api_base_url='https://graph.facebook.com/',
    access_token_url='https://graph.facebook.com/v13.0/oauth/access_token',
    authorize_url='https://www.facebook.com/v13.0/dialog/oauth',
    client_kwargs={'scope': 'public_profile'}
)

@app.get("/auth/{provider}/login")
async def login_via_social(provider: str, request: Request):
    redirect_uri = f"http://localhost:8000/auth/{provider}/callback"
    client = oauth.create_client(provider)
    return await client.authorize_redirect(request, redirect_uri)

@app.get("/auth/{provider}/callback")
async def auth_callback(provider: str, request: Request, db: Session = Depends(get_db)):
    client = oauth.create_client(provider)
    try:
        token = await client.authorize_access_token(request)
    except OAuthError:
        return RedirectResponse(url="http://localhost:3000/login?error=OAuthError")

    if provider == "google":
        user_info = token.get('userinfo')
        if not user_info:
            user_info = await client.parse_id_token(request, token)
        email = user_info.get("email")
        display_name = user_info.get("name", "Google User")
    elif provider == "facebook":
        resp = await client.get('me?fields=id,name', token=token)
        user_info = resp.json()
        email = f"{user_info.get('id')}@facebook.com" # Use ID as mock email if email scope is denied
        display_name = user_info.get("name", "Facebook User")
    else:
        return RedirectResponse(url="http://localhost:3000/login?error=InvalidProvider")

    if not email:
        return RedirectResponse(url="http://localhost:3000/login?error=NoEmail")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email, display_name=display_name, hashed_password=None)
        db.add(user)
        db.commit()
        db.refresh(user)

    access_token = create_access_token(
        data={"sub": user.email}, 
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return RedirectResponse(url=f"http://localhost:3000/login?token={access_token}")

@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Backend is running and connected!"}

@app.post("/api/auth/register")
def register_stub():
    return {"message": "Registration endpoint hit successfully"}


async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
    return user

@app.post("/register", response_model=Token)
def register(user: UserCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password)
    new_user = User(email=user.email, display_name=user.display_name, hashed_password=hashed_password, is_email_verified=False)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Generate an email verification token
    verification_token = create_access_token(
        data={"sub": new_user.email, "type": "verify_email"},
        expires_delta=timedelta(hours=24)
    )
    verification_link = f"http://localhost:3000/verify-email?token={verification_token}"
    print(f"\n[EMAIL LOG] Target Verification Link: {verification_link}\n")
    
    # Trigger actual email send in background
    background_tasks.add_task(send_verification_email, new_user.email, verification_token)
    
    access_token = create_access_token(data={"sub": new_user.email}, expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    return {"access_token": access_token, "token_type": "bearer", "user": new_user}

@app.post("/api/verify-email")
def verify_email_api(payload: VerifyEmailRequest, db: Session = Depends(get_db)):
    token = payload.token
    if not token:
        raise HTTPException(status_code=400, detail="Token is missing")
    try:
        payload_data = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload_data.get("sub")
        token_type: str = payload_data.get("type")
        if email is None or token_type != "verify_email":
            raise HTTPException(status_code=400, detail="Invalid token payload")
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
        
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.is_email_verified:
        return {"message": "Email is already verified", "status": "success"}
        
    user.is_email_verified = True
    db.commit()
    
    return {"message": "Email successfully verified!", "status": "success"}

@app.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before logging in",
        )
    access_token = create_access_token(data={"sub": user.email}, expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    return {"access_token": access_token, "token_type": "bearer", "user": user}

@app.get("/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user
