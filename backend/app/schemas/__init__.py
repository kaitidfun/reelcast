# Schemas package
# Re-exports all schemas for backward compatibility.
# Prefer importing from specific modules (e.g. app.schemas.campaign).

from app.schemas.user import (
    UserCreate,
    UserUpdate,
    UserResponse,
    Token,
    LoginResponse,
    VerifyEmailRequest,
    TwoFactorVerifyRequest,
    TwoFactorLoginRequest,
    TwoFactorDisableRequest,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
)

from app.schemas.social import (
    SocialAccountCreate,
    SocialAccountResponse,
)

from app.schemas.campaign import (
    CampaignCreate,
    CampaignUpdate,
    CampaignResponse,
    CampaignListResponse,
)

from app.schemas.product import (
    ProductImageCreate,
    ProductImageResponse,
    ProductCreate,
    ProductUpdate,
    ProductResponse,
    ProductListResponse,
)

from app.schemas.reel import (
    ReelCreate,
    ReelUpdate,
    ReelResponse,
    ReelListResponse,
)

from app.schemas.distribution import (
    DistributionCreate,
    DistributionUpdate,
    DistributionResponse,
    DistributionListResponse,
)

from app.schemas.analytics import (
    AnalyticsCreate,
    AnalyticsUpdate,
    AnalyticsResponse,
    AnalyticsListResponse,
    EcommerceAccountConnect,
    EcommerceAccountResponse,
    TrackingMetricCreate,
)
