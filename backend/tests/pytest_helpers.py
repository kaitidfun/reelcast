"""Small assertion bridge used while the backend suite runs under pytest.

The suite uses pytest for collection, fixtures, parametrization, async execution,
and reporting.  This helper keeps existing test bodies readable while avoiding a
dependency on ``unittest.TestCase`` during the migration.
"""

from __future__ import annotations

from contextlib import nullcontext
from typing import Any

import pytest


class _RaisesContext:
    def __init__(self, expected_exception: type[BaseException], *args: Any, **kwargs: Any) -> None:
        self._context = pytest.raises(expected_exception, *args, **kwargs)
        self._exception_info: pytest.ExceptionInfo[BaseException] | None = None

    def __enter__(self) -> "_RaisesContext":
        self._exception_info = self._context.__enter__()
        return self

    def __exit__(self, *args: Any) -> bool:
        return self._context.__exit__(*args)

    @property
    def exception(self) -> BaseException:
        assert self._exception_info is not None
        return self._exception_info.value


class PytestAssertions:
    """Pytest-backed assertions for class-based tests."""

    def assertEqual(self, first: Any, second: Any, msg: str | None = None) -> None:
        assert first == second, msg

    def assertNotEqual(self, first: Any, second: Any, msg: str | None = None) -> None:
        assert first != second, msg

    def assertTrue(self, expression: Any, msg: str | None = None) -> None:
        assert expression, msg

    def assertFalse(self, expression: Any, msg: str | None = None) -> None:
        assert not expression, msg

    def assertIs(self, first: Any, second: Any, msg: str | None = None) -> None:
        assert first is second, msg

    def assertIsNone(self, value: Any, msg: str | None = None) -> None:
        assert value is None, msg

    def assertIsInstance(self, value: Any, expected_type: type[Any], msg: str | None = None) -> None:
        assert isinstance(value, expected_type), msg

    def assertIn(self, member: Any, container: Any, msg: str | None = None) -> None:
        assert member in container, msg

    def assertNotIn(self, member: Any, container: Any, msg: str | None = None) -> None:
        assert member not in container, msg

    def assertGreater(self, first: Any, second: Any, msg: str | None = None) -> None:
        assert first > second, msg

    def assertLess(self, first: Any, second: Any, msg: str | None = None) -> None:
        assert first < second, msg

    def addCleanup(self, callback: Any, *args: Any, **kwargs: Any) -> None:
        cleanups = getattr(self, "_cleanups", [])
        cleanups.append((callback, args, kwargs))
        self._cleanups = cleanups

    def teardown_method(self, _method: Any) -> None:
        while getattr(self, "_cleanups", []):
            callback, args, kwargs = self._cleanups.pop()
            callback(*args, **kwargs)

    def assertRaises(self, expected_exception: type[BaseException], *args: Any, **kwargs: Any) -> _RaisesContext:
        return _RaisesContext(expected_exception, *args, **kwargs)

    def assertRaisesRegex(
        self,
        expected_exception: type[BaseException],
        expected_regex: str,
        *args: Any,
        **kwargs: Any,
    ) -> _RaisesContext:
        return _RaisesContext(expected_exception, match=expected_regex, *args, **kwargs)

    def subTest(self, **_parameters: Any):
        return nullcontext()
