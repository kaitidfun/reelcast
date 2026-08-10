"""
Token Encryption Service
========================
Encrypts / decrypts third-party OAuth tokens for Feature 3 (Multi-Platform
Distribution) before they touch the database.

SocialAccount.access_token / refresh_token grant posting authority on a
user's real TikTok / Instagram / Facebook / YouTube account — storing them
as plain text means a database leak hands an attacker the ability to post
as any connected user. Fernet (symmetric, authenticated encryption) fixes
that: the ciphertext is useless without TOKEN_ENCRYPTION_KEY, which lives
only in the backend's environment, never in the database.
"""

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import TOKEN_ENCRYPTION_KEY
from app.exceptions import TokenDecryptionException

_fernet = Fernet(TOKEN_ENCRYPTION_KEY.encode())


def encrypt_token(plaintext: str) -> str:
    """Encrypt a plaintext OAuth token for storage in SocialAccount."""
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """
    Decrypt a stored OAuth token back to its usable plaintext value.

    Raises:
        TokenDecryptionException: If the ciphertext is corrupted or was
            encrypted under a different TOKEN_ENCRYPTION_KEY.
    """
    try:
        return _fernet.decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise TokenDecryptionException() from exc
