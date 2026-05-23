"""Pipedrive batch operations with rate limiting.

Implements max 5 concurrent calls with backoff.
"""
from __future__ import annotations
import time
from typing import Any, Callable, TypeVar

T = TypeVar('T')

# Rate limiting: max 5 concurrent calls, 100ms between batches
MAX_CONCURRENT = 5
BATCH_DELAY_MS = 100


def batch_operations(
    items: list[Any],
    operation: Callable[[Any], T],
    operation_name: str = "operation"
) -> list[T | None]:
    """Execute operation on items in batches of MAX_CONCURRENT.
    
    Args:
        items: List of items to process
        operation: Function(item) -> result
        operation_name: Name for logging
        
    Returns:
        List of results (None for failed items)
    """
    results = []
    
    for i in range(0, len(items), MAX_CONCURRENT):
        batch = items[i:i + MAX_CONCURRENT]
        
        for item in batch:
            try:
                result = operation(item)
                results.append(result)
            except Exception as e:
                import sys
                sys.stderr.write(f"WARN: {operation_name} failed on item {i}: {e}\n")
                results.append(None)
        
        # Delay before next batch (except last batch)
        if i + MAX_CONCURRENT < len(items):
            time.sleep(BATCH_DELAY_MS / 1000.0)
    
    return results


def batch_search_organizations(
    client,
    org_names: list[str]
) -> list[dict | None]:
    """Batch search for organizations with rate limiting.
    
    Args:
        client: PipedriveClient instance
        org_names: List of organization names
        
    Returns:
        List of org dicts (None for not found)
    """
    def search_one(name: str) -> dict:
        results = client.search_organizations(name, exact=True)
        return results[0] if results else {}
    
    return batch_operations(org_names, search_one, "search_organization")


if __name__ == "__main__":
    # Test
    def double(x):
        time.sleep(0.01)
        return x * 2
    
    items = list(range(12))
    results = batch_operations(items, double, "double")
    print(f"Processed {len(items)} items in batches of {MAX_CONCURRENT}")
    print(f"Results: {results}")
