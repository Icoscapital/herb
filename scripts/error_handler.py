"""Robust error handling utilities for Herb.

Provides safe wrappers for API calls with logging and recovery.
"""
from __future__ import annotations
import sys
import time
from typing import Callable, TypeVar, Optional

T = TypeVar('T')


class HerbError(Exception):
    """Base exception for Herb errors."""
    pass


class APIError(HerbError):
    """API call failed."""
    pass


class DataError(HerbError):
    """Data validation or state error."""
    pass


def safe_api_call(
    func: Callable[..., T],
    max_retries: int = 1,
    backoff: float = 1.0,
    log_prefix: str = "API"
) -> T:
    """Call func with retry logic and error handling.
    
    Args:
        func: Callable to execute
        max_retries: Number of retries on failure
        backoff: Delay between retries (seconds)
        log_prefix: Prefix for error messages
        
    Returns:
        Result of func()
        
    Raises:
        APIError: If all retries exhausted
    """
    last_error = None
    
    for attempt in range(max_retries + 1):
        try:
            return func()
        except Exception as e:
            last_error = e
            if attempt < max_retries:
                sys.stderr.write(
                    f"[{log_prefix}] Attempt {attempt + 1} failed: {type(e).__name__}: {str(e)[:60]}\n"
                )
                time.sleep(backoff * (attempt + 1))
            else:
                sys.stderr.write(
                    f"[{log_prefix}] All {max_retries + 1} attempts failed. Aborting.\n"
                )
    
    raise APIError(f"{log_prefix} failed after {max_retries + 1} attempts: {last_error}")


def validate_file_size(
    content_bytes: bytes,
    max_size_mb: float,
    file_name: str = "attachment"
) -> None:
    """Validate file size before upload.
    
    Args:
        content_bytes: File content
        max_size_mb: Maximum size in MB
        file_name: Name for error message
        
    Raises:
        DataError: If file exceeds max size
    """
    size_mb = len(content_bytes) / (1024 * 1024)
    if size_mb > max_size_mb:
        raise DataError(
            f"{file_name} is {size_mb:.1f}MB, exceeds limit of {max_size_mb}MB"
        )


def validate_required_fields(data: dict, required: list[str], context: str = "") -> None:
    """Validate required fields present in dict.
    
    Args:
        data: Dictionary to check
        required: List of required keys
        context: Context for error message
        
    Raises:
        DataError: If any required field missing or None
    """
    missing = [k for k in required if not data.get(k)]
    if missing:
        raise DataError(f"{context}: Missing required fields: {missing}")


if __name__ == "__main__":
    # Test
    def failing_func():
        raise ValueError("Test error")
    
    try:
        safe_api_call(failing_func, max_retries=2)
    except APIError as e:
        print(f"Caught expected error: {e}")
    
    # Test file size
    try:
        validate_file_size(b"x" * 5_000_000, max_size_mb=4, file_name="test.xlsx")
    except DataError as e:
        print(f"Caught size error: {e}")
    
    print("[OK] Error handlers work")
