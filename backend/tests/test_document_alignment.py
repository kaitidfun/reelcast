from __future__ import annotations

import ast
import unittest
from pathlib import Path

import app.exceptions as domain_exceptions


BACKEND_ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = BACKEND_ROOT / "app"

DOCUMENT_METHODS = {
    "registerGuest",
    "authenticateMember",
    "updateAccountProfile",
    "manage2FA",
    "inputPromptAndSelectProduct",
    "generateReels",
    "generateCaptionsAndHashtags",
    "uploadOwnReel",
    "overlayImagesAndLogos",
    "previewAndApproveContent",
    "regenerateContent",
    "createCampaign",
    "createProduct",
    "browseLibrary",
}

DOCUMENT_EXCEPTIONS = {
    "EmailAlreadyExistsException",
    "WeakPasswordException",
    "InvalidEmailFormatException",
    "InvalidCredentialsException",
    "AccountNotVerifiedException",
    "OAuthProviderException",
    "InvalidImageFormatException",
    "FileSizeLimitExceededException",
    "DatabaseUpdateException",
    "UnsupportedVideoFormatException",
    "VideoSizeLimitExceededException",
    "InvalidPromptLengthException",
    "ProductNotFoundException",
    "GeminiAPIException",
    "LTXVideoAPIException",
    "GenerationTimeoutException",
    "ContentModerationException",
    "FFmpegProcessingException",
    "InvalidCoordinateException",
    "MediaNotFoundException",
    "RateLimitExceededException",
    "PromptValidationException",
    "DuplicateCampaignNameException",
    "DatabaseInsertException",
    "CampaignNotFoundException",
    "MaxImagesExceededException",
    "DatabaseRetrieveException",
}


class DocumentAlignmentTests(unittest.TestCase):
    def test_all_document_methods_exist(self) -> None:
        function_names: set[str] = set()
        for path in APP_ROOT.rglob("*.py"):
            tree = ast.parse(path.read_text(encoding="utf-8"))
            function_names.update(
                node.name
                for node in ast.walk(tree)
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            )

        self.assertEqual(set(), DOCUMENT_METHODS - function_names)

    def test_all_document_exceptions_exist(self) -> None:
        exported = set(domain_exceptions.__all__)
        self.assertEqual(set(), DOCUMENT_EXCEPTIONS - exported)

        for exception_name in DOCUMENT_EXCEPTIONS:
            exception_type = getattr(domain_exceptions, exception_name)
            self.assertTrue(
                issubclass(exception_type, domain_exceptions.ReelCastException)
            )

    def test_reel_model_contains_first_frame_url(self) -> None:
        model_tree = ast.parse(
            (APP_ROOT / "models" / "models.py").read_text(encoding="utf-8")
        )
        reel_class = next(
            node
            for node in model_tree.body
            if isinstance(node, ast.ClassDef) and node.name == "Reel"
        )
        field_names = {
            target.id
            for node in reel_class.body
            if isinstance(node, ast.Assign)
            for target in node.targets
            if isinstance(target, ast.Name)
        }
        self.assertIn("first_frame_url", field_names)


if __name__ == "__main__":
    unittest.main()
