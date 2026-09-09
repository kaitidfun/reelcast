from __future__ import annotations

import pytest
from tests.pytest_helpers import PytestAssertions


from app.exceptions import TokenDecryptionException
from app.services.crypto_service import decrypt_token, encrypt_token


# UTC: F3-UTC01, F3-UTC02, F3-UTC07
# STC: STC-F3-01, STC-F3-04
class TestTokenEncryptionTests(PytestAssertions):
    """Feature 3 prep: SocialAccount token encryption at rest."""

    def test_round_trip_returns_original_plaintext(self) -> None:
        plaintext = "tiktok-access-token-abc123"
        ciphertext = encrypt_token(plaintext)

        self.assertNotEqual(plaintext, ciphertext)
        self.assertEqual(plaintext, decrypt_token(ciphertext))

    def test_ciphertext_is_not_deterministic(self) -> None:
        # Fernet includes a random IV/timestamp per call, so encrypting the
        # same plaintext twice must not produce identical ciphertext.
        plaintext = "same-token-value"
        self.assertNotEqual(encrypt_token(plaintext), encrypt_token(plaintext))

    def test_decrypting_garbage_raises_token_decryption_exception(self) -> None:
        with self.assertRaises(TokenDecryptionException):
            decrypt_token("not-a-real-fernet-token")
