**Context:** You are an expert Python Backend Developer specializing in FastAPI, SQLAlchemy (Async), and PostgreSQL. We are building the backend for a project called "ReelCast".

**Task:** Implement the Database Models and provide a basic structural outline for the Authentication Service covering "Feature 1: Registration & Authentication System".

**Database & System Requirements:**

1.  **Frameworks:** FastAPI, SQLAlchemy (using `asyncpg` for asynchronous operations), and PostgreSQL.

2.  **Authentication Types:**
    - Local (Email & Password)

    - Social/OAuth (Google and Facebook)

3.  **Security Features:**
    - Passwords must be hashed (use `passlib` and `bcrypt`).

    - Passwords must be nullable to accommodate users who sign up via OAuth.

    - Include flags and fields to support Email Verification and Two-Factor Authentication (2FA via TOTP).

**Detailed Schema Requirements for the `users` table:** Please create the SQLAlchemy models with the following specifications:

- `AuthProvider` Enum: `LOCAL`, `GOOGLE`, `FACEBOOK`.

- Columns:
  - `id`: Integer, Primary Key, Indexed.

  - `email`: String, Unique, Indexed, Not Null.

  - `hashed_password`: String, Nullable (for OAuth users).

  - `full_name`: String, Nullable.

  - `auth_provider`: Enum (AuthProvider), Default: LOCAL.

  - `social_id`: String, Unique, Indexed, Nullable (to store Google/Facebook user IDs).

  - `is_email_verified`: Boolean, Default: False.

  - `is_2fa_enabled`: Boolean, Default: False.

  - `two_factor_secret`: String, Nullable (to store the TOTP secret key).

  - `is_active`: Boolean, Default: True.

  - `created_at`: DateTime with timezone, auto-set on creation.

  - `updated_at`: DateTime with timezone, auto-updated on modification.

**Deliverables:**

1.  Generate the complete, production-ready `models.py` file using SQLAlchemy declarative base.

2.  Provide a brief skeleton/example in `schemas.py` (Pydantic models) for User Registration and User Response.

3.  Ensure the code follows modern Python typing and FastAPI best practices. Do not write the full API logic yet, just the database layer and Pydantic schemas.
