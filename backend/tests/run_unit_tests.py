from __future__ import annotations

import argparse
import logging
import re
import sys
import time
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
TESTS_DIR = BACKEND_DIR / "tests"
UNIT_DIR = TESTS_DIR / "unit"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _test_label(test: unittest.TestCase) -> tuple[str | None, str]:
    method_name = test._testMethodName.removeprefix("test_")
    tokens = method_name.split("_")
    test_id: str | None = None

    if (
        len(tokens) >= 2
        and re.fullmatch(r"F\d+", tokens[0])
        and re.fullmatch(r"UTC\d+", tokens[1])
    ):
        id_tokens = tokens[:2]
        index = 2
        while index < len(tokens):
            token = tokens[index]
            if re.fullmatch(r"TC\d+", token) or token == "and":
                id_tokens.append(token)
                index += 1
                continue
            break
        test_id = "-".join(id_tokens).replace("-and-", "/")
        tokens = tokens[index:]

    description = " ".join(tokens).strip()
    if not description:
        description = method_name.replace("_", " ")
    return test_id, description


class ReadableTestResult(unittest.TextTestResult):
    """Print one concise terminal line for every backend unit testcase."""

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._started_at: dict[unittest.TestCase, float] = {}
        self._current_suite: str | None = None

    def startTest(self, test: unittest.TestCase) -> None:
        super().startTest(test)
        self._started_at[test] = time.perf_counter()
        module_name = test.__class__.__module__.split(".")[-1]
        suite_name = f"{test.__class__.__name__} ({module_name}.py)"
        if suite_name != self._current_suite:
            if self._current_suite is not None:
                self.stream.writeln()
            self.stream.writeln(f"[SUITE] {suite_name}")
            self._current_suite = suite_name

    def _write_result(self, status: str, test: unittest.TestCase) -> None:
        elapsed_ms = round(
            (time.perf_counter() - self._started_at.pop(test, time.perf_counter()))
            * 1000
        )
        test_id, description = _test_label(test)
        label = f"{test_id} | {description}" if test_id else description
        self.stream.writeln(f"  [{status}] {label} ({elapsed_ms} ms)")

    def addSuccess(self, test: unittest.TestCase) -> None:
        unittest.TestResult.addSuccess(self, test)
        self._write_result("PASS", test)

    def addFailure(self, test: unittest.TestCase, err) -> None:
        unittest.TestResult.addFailure(self, test, err)
        self._write_result("FAIL", test)

    def addError(self, test: unittest.TestCase, err) -> None:
        unittest.TestResult.addError(self, test, err)
        self._write_result("ERROR", test)

    def addSkip(self, test: unittest.TestCase, reason: str) -> None:
        unittest.TestResult.addSkip(self, test, reason)
        self._write_result("SKIP", test)

    def addExpectedFailure(self, test: unittest.TestCase, err) -> None:
        unittest.TestResult.addExpectedFailure(self, test, err)
        self._write_result("XFAIL", test)

    def addUnexpectedSuccess(self, test: unittest.TestCase) -> None:
        unittest.TestResult.addUnexpectedSuccess(self, test)
        self._write_result("XPASS", test)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run readable backend unit tests.")
    parser.add_argument(
        "--repeat",
        type=int,
        default=1,
        help="Run the full discovered suite this many times (default: 1).",
    )
    args = parser.parse_args()
    if args.repeat < 1:
        parser.error("--repeat must be at least 1")
    return args


def main() -> int:
    args = _parse_args()
    print("ReelCast Backend Unit Tests")
    print("===========================", flush=True)

    previous_logging_level = logging.root.manager.disable
    logging.disable(logging.CRITICAL)
    all_successful = True
    total_run = 0
    total_failed = 0
    total_errors = 0
    total_skipped = 0
    try:
        for round_number in range(1, args.repeat + 1):
            if args.repeat > 1:
                print(f"\n[ROUND {round_number}/{args.repeat}]")

            suite = unittest.defaultTestLoader.discover(
                start_dir=str(UNIT_DIR),
                pattern="test_*.py",
                top_level_dir=str(TESTS_DIR),
            )
            result = unittest.TextTestRunner(
                stream=sys.stdout,
                verbosity=0,
                resultclass=ReadableTestResult,
                buffer=True,
            ).run(suite)

            failed = len(result.failures)
            errors = len(result.errors)
            skipped = len(result.skipped)
            passed = (
                result.testsRun
                - failed
                - errors
                - skipped
                - len(result.expectedFailures)
                - len(result.unexpectedSuccesses)
            )
            state = "PASS" if result.wasSuccessful() else "FAIL"
            print(
                f"\n[RESULT] {state} | {passed} passed | {failed} failed | "
                f"{errors} errors | {skipped} skipped"
            )

            all_successful = all_successful and result.wasSuccessful()
            total_run += result.testsRun
            total_failed += failed
            total_errors += errors
            total_skipped += skipped
    finally:
        logging.disable(previous_logging_level)

    if args.repeat > 1:
        total_passed = total_run - total_failed - total_errors - total_skipped
        state = "PASS" if all_successful else "FAIL"
        print(
            f"\n[STABILITY] {state} | {args.repeat} rounds | "
            f"{total_passed}/{total_run} passed"
        )
    return 0 if all_successful else 1


if __name__ == "__main__":
    raise SystemExit(main())
