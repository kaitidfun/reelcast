"""Domain exceptions defined by the ReelCast software design document."""

from __future__ import annotations


class ReelCastException(Exception):
    """Base exception carrying the HTTP status used by the API layer."""

    status_code = 400
    default_message = "ReelCast operation failed"

    def __init__(self, message: str | None = None) -> None:
        self.message = message or self.default_message
        super().__init__(self.message)

    def __str__(self) -> str:
        return f"{type(self).__name__}: {self.message}"


class EmailAlreadyExistsException(ReelCastException):
    default_message = "The email is already registered in the system"


class WeakPasswordException(ReelCastException):
    default_message = (
        "Password must contain at least 6 characters, including uppercase, "
        "lowercase, number, and special character"
    )


class InvalidEmailFormatException(ReelCastException):
    status_code = 422
    default_message = "The email format is invalid"


class InvalidCredentialsException(ReelCastException):
    status_code = 401
    default_message = "The email or password is incorrect"


class AccountNotVerifiedException(ReelCastException):
    status_code = 403
    default_message = "Please verify your email before logging in"


class OAuthProviderException(ReelCastException):
    status_code = 502
    default_message = "Third-party authentication failed or timed out"


class InvalidVerificationCodeException(ReelCastException):
    default_message = "The 6-digit TOTP verification code is invalid"


class InvalidImageFormatException(ReelCastException):
    default_message = "The uploaded image format is not supported"


class FileSizeLimitExceededException(ReelCastException):
    status_code = 413
    default_message = "The uploaded image exceeds the 2MB size limit"


class DatabaseUpdateException(ReelCastException):
    status_code = 500
    default_message = "The system failed to update the database"


class UnsupportedVideoFormatException(ReelCastException):
    default_message = "Unsupported video format. Allowed: mp4, mov, avi"


class VideoSizeLimitExceededException(ReelCastException):
    default_message = "Video file size exceeds the 500MB limit"


class DurationExceededException(ReelCastException):
    default_message = "Video duration exceeds the 60-second limit"


class InvalidPromptLengthException(ReelCastException):
    default_message = "Prompt must contain between 1 and 500 characters"


class InvalidPromptException(ReelCastException):
    default_message = "Prompt text cannot be empty"


class ProductNotFoundException(ReelCastException):
    status_code = 404
    default_message = "The selected product was not found"


class GeminiAPIException(ReelCastException):
    status_code = 503
    default_message = "The Google Gemini service is unavailable"


class LTXVideoAPIException(ReelCastException):
    status_code = 502
    default_message = "The Fal.ai LTX Video service returned an error"


class GenerationTimeoutException(ReelCastException):
    status_code = 504
    default_message = "Video generation exceeded the maximum allowed time"


class FFmpegProcessingException(ReelCastException):
    status_code = 500
    default_message = "FFmpeg failed to render the final video"


class InvalidCoordinateException(ReelCastException):
    default_message = "The overlay position is outside the supported video frame bounds"


class MediaNotFoundException(ReelCastException):
    status_code = 404
    default_message = "The preview media is missing or has expired"


class RateLimitExceededException(ReelCastException):
    status_code = 429
    default_message = "Too many regeneration requests were submitted"


class DuplicateCampaignNameException(ReelCastException):
    status_code = 409
    default_message = "A campaign with this name already exists"


class DatabaseInsertException(ReelCastException):
    status_code = 500
    default_message = "The system failed to save the new database record"


class CampaignNotFoundException(ReelCastException):
    status_code = 404
    default_message = "The campaign was not found or does not belong to the user"


class MaxImagesExceededException(ReelCastException):
    default_message = "Maximum 5 images allowed per product"


class DatabaseRetrieveException(ReelCastException):
    status_code = 500
    default_message = "The system failed to retrieve campaigns or products"


__all__ = [
    "AccountNotVerifiedException",
    "CampaignNotFoundException",
    "DatabaseInsertException",
    "DatabaseRetrieveException",
    "DatabaseUpdateException",
    "DuplicateCampaignNameException",
    "DurationExceededException",
    "EmailAlreadyExistsException",
    "FFmpegProcessingException",
    "FileSizeLimitExceededException",
    "GeminiAPIException",
    "GenerationTimeoutException",
    "InvalidCoordinateException",
    "InvalidCredentialsException",
    "InvalidEmailFormatException",
    "InvalidImageFormatException",
    "InvalidPromptException",
    "InvalidPromptLengthException",
    "InvalidVerificationCodeException",
    "LTXVideoAPIException",
    "MaxImagesExceededException",
    "MediaNotFoundException",
    "OAuthProviderException",
    "ProductNotFoundException",
    "RateLimitExceededException",
    "ReelCastException",
    "UnsupportedVideoFormatException",
    "VideoSizeLimitExceededException",
    "WeakPasswordException",
]
