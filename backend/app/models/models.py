from sqlalchemy import (
    Column, String, Boolean, Integer, Text, Date,
    ForeignKey, Enum, text,
)
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMP, JSONB
from sqlalchemy.orm import relationship
import enum
from app.database import Base


class BannerColor(str, enum.Enum):
    Twilight = "Twilight"
    Pacific = "Pacific"
    Seafoam = "Seafoam"
    Amethyst = "Amethyst"
    Sunrise = "Sunrise"
    Aurora = "Aurora"


class User(Base):
    __tablename__ = "users"

    user_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    email = Column(String, unique=True, index=True, nullable=True)
    display_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=True)
    is_email_verified = Column(Boolean, nullable=False, server_default=text("false"))
    is_2fa_enabled = Column(Boolean, nullable=False, server_default=text("false"))
    two_factor_secret = Column(String, nullable=True)
    profile_image = Column(String, nullable=True)
    created_at = Column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at = Column(
        TIMESTAMP(timezone=False),
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=text("CURRENT_TIMESTAMP"),
    )

    # Relationships
    social_accounts = relationship(
        "SocialAccount", back_populates="user", cascade="all, delete-orphan",
    )
    campaigns = relationship(
        "Campaign", back_populates="user", cascade="all, delete-orphan",
    )
    products = relationship(
        "Product", back_populates="user", cascade="all, delete-orphan",
    )
    reels = relationship(
        "Reel", back_populates="user", cascade="all, delete-orphan",
    )

    @property
    def id(self):
        return self.user_id


class SocialAccount(Base):
    __tablename__ = "social_accounts"

    account_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=True,
    )
    platform_name = Column(String, nullable=False)
    access_token = Column(String, nullable=False)
    refresh_token = Column(String, nullable=True)
    created_at = Column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    # Relationships
    user = relationship("User", back_populates="social_accounts")
    distributions = relationship(
        "Distribution", back_populates="account", cascade="all, delete-orphan",
    )


class Campaign(Base):
    __tablename__ = "campaigns"

    campaign_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=True,
    )
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    banner_color = Column(
        Enum(BannerColor, name="banner_color_enum"),
        nullable=False,
        server_default="Twilight",
        default=BannerColor.Twilight
    )
    banner_image_url = Column(String, nullable=True)
    created_at = Column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at = Column(
        TIMESTAMP(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=text("CURRENT_TIMESTAMP"),
    )
    deleted_at = Column(TIMESTAMP(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", back_populates="campaigns")
    products = relationship(
        "Product", back_populates="campaign", cascade="all, delete-orphan",
    )


class Product(Base):
    __tablename__ = "products"

    product_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    campaign_id = Column(
        UUID(as_uuid=True),
        ForeignKey("campaigns.campaign_id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=True,
    )
    product_name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    affiliate_link = Column(String, nullable=True)
    brand_logo_url = Column(String, nullable=True)
    created_at = Column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at = Column(
        TIMESTAMP(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=text("CURRENT_TIMESTAMP"),
    )
    deleted_at = Column(TIMESTAMP(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", back_populates="products")
    campaign = relationship("Campaign", back_populates="products")
    images = relationship(
        "ProductImage", back_populates="product", cascade="all, delete-orphan",
    )
    reels = relationship("Reel", back_populates="product")
    analytics = relationship(
        "Analytics", back_populates="product", cascade="all, delete-orphan",
    )


class ProductImage(Base):
    __tablename__ = "product_images"

    image_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.product_id", ondelete="CASCADE"),
        nullable=True,
    )
    image_url = Column(String, nullable=False)
    is_primary = Column(Boolean, server_default=text("false"))
    created_at = Column(
        TIMESTAMP(timezone=False),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    # Relationships
    product = relationship("Product", back_populates="images")


class Reel(Base):
    __tablename__ = "reels"

    reel_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=True,
    )
    product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.product_id", ondelete="SET NULL"),
        nullable=True,
    )
    prompt_text = Column(Text, nullable=False)
    caption_and_hashtags = Column(JSONB, nullable=True)
    uploaded_video_url = Column(String, nullable=True)
    b_roll_url = Column(String, nullable=True)
    final_commercial_video_url = Column(String, nullable=True)
    status = Column(
        Enum(
            "Pending", "Generating", "Completed", "Failed",
            name="reel_status_enum",
            create_constraint=True,
        ),
        nullable=False,
        server_default="Pending",
    )
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, nullable=False, server_default=text("0"))
    created_at = Column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    deleted_at = Column(TIMESTAMP(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", back_populates="reels")
    product = relationship("Product", back_populates="reels")
    distributions = relationship(
        "Distribution", back_populates="reel", cascade="all, delete-orphan",
    )


class Distribution(Base):
    __tablename__ = "distributions"

    distribution_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    reel_id = Column(
        UUID(as_uuid=True),
        ForeignKey("reels.reel_id", ondelete="CASCADE"),
        nullable=True,
    )
    account_id = Column(
        UUID(as_uuid=True),
        ForeignKey("social_accounts.account_id", ondelete="CASCADE"),
        nullable=True,
    )
    scheduled_time = Column(TIMESTAMP(timezone=True), nullable=True)
    status = Column(
        Enum(
            "Pending", "Uploading", "Published", "Failed",
            name="distribution_status_enum",
            create_constraint=True,
        ),
        nullable=False,
        server_default="Pending",
    )
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, nullable=False, server_default=text("0"))
    created_at = Column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    # Relationships
    reel = relationship("Reel", back_populates="distributions")
    account = relationship("SocialAccount", back_populates="distributions")
    analytics = relationship(
        "Analytics", back_populates="distribution", cascade="all, delete-orphan",
    )


class Analytics(Base):
    __tablename__ = "analytics"

    analytics_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    distribution_id = Column(
        UUID(as_uuid=True),
        ForeignKey("distributions.distribution_id", ondelete="CASCADE"),
        nullable=True,
    )
    product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.product_id", ondelete="CASCADE"),
        nullable=True,
    )
    source_platform = Column(String, nullable=True)
    views = Column(Integer, server_default=text("0"))
    clicks = Column(Integer, server_default=text("0"))
    orders = Column(Integer, server_default=text("0"))
    record_date = Column(Date, nullable=True)
    created_at = Column(
        TIMESTAMP(timezone=False),
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at = Column(
        TIMESTAMP(timezone=False),
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=text("CURRENT_TIMESTAMP"),
    )

    # Relationships
    distribution = relationship("Distribution", back_populates="analytics")
    product = relationship("Product", back_populates="analytics")
