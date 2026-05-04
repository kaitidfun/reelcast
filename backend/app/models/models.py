from sqlalchemy import Column, String, Boolean, text, ForeignKey, Integer, Enum
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMP, JSONB
from sqlalchemy.orm import relationship
from app.database import Base

class User(Base):
    __tablename__ = "users"

    user_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    email = Column(String, unique=True, index=True, nullable=False)
    display_name = Column(String)
    hashed_password = Column(String, nullable=True)
    is_email_verified = Column(Boolean, default=False)
    is_2fa_enabled = Column(Boolean, default=False)
    two_factor_secret = Column(String, nullable=True)
    profile_image = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=text("now()"))

    social_accounts = relationship("SocialAccount", back_populates="user", cascade="all, delete-orphan")
    campaigns = relationship("Campaign", back_populates="user", cascade="all, delete-orphan")
    products = relationship("Product", back_populates="user", cascade="all, delete-orphan")
    reels = relationship("Reel", back_populates="user", cascade="all, delete-orphan")

    @property
    def id(self):
        return self.user_id

class SocialAccount(Base):
    __tablename__ = "social_accounts"

    account_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    platform_name = Column(String, nullable=False)
    access_token = Column(String, nullable=False)
    refresh_token = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=text("now()"))

    user = relationship("User", back_populates="social_accounts")
    distributions = relationship("Distribution", back_populates="account", cascade="all, delete-orphan")

class Campaign(Base):
    __tablename__ = "campaigns"

    campaign_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=text("now()"))
    updated_at = Column(TIMESTAMP(timezone=True), onupdate=text("now()"))
    deleted_at = Column(TIMESTAMP(timezone=True), nullable=True)

    user = relationship("User", back_populates="campaigns")
    products = relationship("Product", back_populates="campaign")

class Product(Base):
    __tablename__ = "products"

    product_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.campaign_id", ondelete="SET NULL"), nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    product_name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    affiliate_link = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    brand_logo_url = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=text("now()"))
    updated_at = Column(TIMESTAMP(timezone=True), onupdate=text("now()"))
    deleted_at = Column(TIMESTAMP(timezone=True), nullable=True)

    user = relationship("User", back_populates="products")
    campaign = relationship("Campaign", back_populates="products")
    reels = relationship("Reel", back_populates="product")
    analytics = relationship("Analytics", back_populates="product", cascade="all, delete-orphan")

class Reel(Base):
    __tablename__ = "reels"

    reel_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.product_id", ondelete="SET NULL"), nullable=True)
    prompt_text = Column(String, nullable=True)
    caption_and_hashtags = Column(JSONB, nullable=True)
    uploaded_video_url = Column(String, nullable=True)
    b_roll_url = Column(String, nullable=True)
    final_commercial_video_url = Column(String, nullable=True)
    status = Column(Enum('Pending', 'Generating', 'Completed', 'Failed', name='reel_status_enum'), default='Pending')
    error_message = Column(String, nullable=True)
    retry_count = Column(Integer, default=0)
    created_at = Column(TIMESTAMP(timezone=True), server_default=text("now()"))
    deleted_at = Column(TIMESTAMP(timezone=True), nullable=True)

    user = relationship("User", back_populates="reels")
    product = relationship("Product", back_populates="reels")
    distributions = relationship("Distribution", back_populates="reel", cascade="all, delete-orphan")

class Distribution(Base):
    __tablename__ = "distributions"

    distribution_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    reel_id = Column(UUID(as_uuid=True), ForeignKey("reels.reel_id", ondelete="CASCADE"), nullable=False)
    account_id = Column(UUID(as_uuid=True), ForeignKey("social_accounts.account_id", ondelete="CASCADE"), nullable=False)
    scheduled_time = Column(TIMESTAMP(timezone=True), nullable=True)
    status = Column(Enum('Pending', 'Uploading', 'Published', 'Failed', name='distribution_status_enum'), default='Pending')
    error_message = Column(String, nullable=True)
    retry_count = Column(Integer, default=0)
    created_at = Column(TIMESTAMP(timezone=True), server_default=text("now()"))

    reel = relationship("Reel", back_populates="distributions")
    account = relationship("SocialAccount", back_populates="distributions")
    analytics = relationship("Analytics", back_populates="distribution", cascade="all, delete-orphan")

class Analytics(Base):
    __tablename__ = "analytics"

    analytics_id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    distribution_id = Column(UUID(as_uuid=True), ForeignKey("distributions.distribution_id", ondelete="CASCADE"), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.product_id", ondelete="CASCADE"), nullable=False)
    source_platform = Column(String, nullable=False)
    views = Column(Integer, default=0)
    clicks = Column(Integer, default=0)
    orders = Column(Integer, default=0)
    last_updated = Column(TIMESTAMP(timezone=True), server_default=text("now()"), onupdate=text("now()"))

    distribution = relationship("Distribution", back_populates="analytics")
    product = relationship("Product", back_populates="analytics")
