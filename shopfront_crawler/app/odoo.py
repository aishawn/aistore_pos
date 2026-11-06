import asyncio
import math
import re
from typing import Any

import httpx


class OdooIntegrationError(RuntimeError):
    pass


def receipt_count(value: Any) -> int | None:
    """Normalize integer counts from Odoo JSON-RPC without accepting fractions."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value >= 0 else None
    if isinstance(value, float) and math.isfinite(value) and value.is_integer() and value >= 0:
        return int(value)
    if isinstance(value, str) and re.fullmatch(r"\d+", value.strip()):
        return int(value.strip())
    return None


class OdooSyncClient:
    def __init__(self, base_url: str, token: str, database: str, enabled: bool, business_write: bool = False, fallback_token: str = "", http: httpx.AsyncClient | None = None):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.database = database
        self.enabled = enabled
        self.business_write = business_write
        self.fallback_token = fallback_token if fallback_token != token else ""
        self.http = http or httpx.AsyncClient(timeout=90)

    async def close(self) -> None:
        await self.http.aclose()

    async def sync(
        self,
        import_type: str,
        store_key: str,
        items: list[dict[str, Any]],
        *,
        snapshot_complete: bool = False,
        snapshot_finalize: bool = False,
        snapshot_source_ids: list[str] | None = None,
        snapshot_at: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self.enabled:
            raise OdooIntegrationError("Odoo import is disabled")
        if not self.base_url or not self.token:
            raise OdooIntegrationError("Odoo integration URL/token is not configured")
        params = {"type": import_type, "store_key": store_key, "business_write": self.business_write, "items": items}
        if import_type == "inventory" and snapshot_complete:
            params.update({"replace": True, "snapshot_complete": True})
        if import_type == "inventory" and snapshot_finalize:
            params.update({"snapshot_finalize": True, "snapshot_source_ids": snapshot_source_ids or []})
            if snapshot_at:
                params["snapshot_at"] = snapshot_at
        if extra:
            params.update(extra)
        payload = {
            "jsonrpc": "2.0",
            "method": "call",
            "params": params,
            "id": None,
        }
        tokens = [self.token] + ([self.fallback_token] if self.fallback_token else [])
        last_error = "Odoo import failed"
        for token in tokens:
            response = None
            # Dokploy containers can briefly lose external DNS during a
            # rolling deployment. Keep the batch alive long enough for DNS
            # and the reverse proxy to recover instead of failing the whole
            # multi-hour snapshot.
            for attempt in range(10):
                try:
                    response = await self.http.post(
                        f"{self.base_url}/api/shopfront/sync",
                        json=payload,
                        headers={"X-Shopfront-Integration-Token": token, "X-Odoo-Database": self.database, "Accept": "application/json"},
                    )
                    if response.status_code not in {502, 503, 504}:
                        break
                    last_error = f"Odoo API failed ({response.status_code}): {response.text[:500]}"
                except (httpx.ConnectError, httpx.ReadTimeout, httpx.RemoteProtocolError) as exc:
                    last_error = f"Odoo connection failed: {exc!r}"
                if attempt < 9:
                    await asyncio.sleep(min(30, 2 ** attempt))
            if response is None:
                continue
            if response.status_code >= 400:
                last_error = f"Odoo API failed ({response.status_code}): {response.text[:500]}"
                continue
            data = response.json()
            if isinstance(data, dict) and data.get("error"):
                error = data["error"]
                if isinstance(error, dict):
                    error_data = error.get("data") if isinstance(error.get("data"), dict) else {}
                    last_error = str(error_data.get("message") or error.get("message") or "Odoo JSON-RPC call failed")
                else:
                    last_error = str(error)
                break
            result = data.get("result") if isinstance(data, dict) and isinstance(data.get("result"), dict) else data
            if not isinstance(result, dict) or result.get("ok") is not True:
                last_error = str(result.get("error", "Odoo returned no successful import receipt")) if isinstance(result, dict) else "Odoo returned an invalid import response"
                if last_error != "unauthorized":
                    break
                continue
            if result.get("item_count") != len(items):
                last_error = f"Odoo receipt item_count mismatch: expected {len(items)}, got {result.get('item_count')!r}"
                break
            if self.business_write and import_type != "customer_history":
                business = result.get("business")
                if not isinstance(business, dict):
                    last_error = f"Odoo did not return a formal {import_type} business receipt"
                    break
                if import_type == "sales":
                    skipped = business.get("skipped")
                    imported_value = business.get("imported")
                    if imported_value is None:
                        imported_value = business.get("created")
                    updated_value = business.get("updated_orders")
                    if updated_value is None:
                        updated_value = business.get("updated")
                    imported = receipt_count(imported_value)
                    updated = receipt_count(updated_value)
                    if "mirrored" in business and imported == 0 and updated in (None, 0):
                        last_error = "Odoo returned a mirror-only sales acknowledgement; formal sales import is required"
                        break
                    if imported is None or updated is None:
                        count_types = {
                            key: type(business.get(key)).__name__
                            for key in ("imported", "created", "updated_orders", "updated")
                            if key in business
                        }
                        last_error = f"Odoo sales receipt has invalid imported/updated counts (fields={sorted(business)}, count_types={count_types})"
                        break
                    if skipped is None and imported + updated == len(items):
                        # Older Odoo builds omit skipped=[] when every order
                        # was imported or updated. Counts still prove that no
                        # item was skipped, so accept this complete receipt.
                        skipped = []
                    if not isinstance(skipped, list):
                        last_error = "Odoo sales receipt has no skipped-item details"
                        break
                    if imported + updated + len(skipped) != len(items):
                        last_error = (
                            "Odoo sales receipt count mismatch: "
                            f"requested={len(items)}, imported={imported}, updated={updated}, skipped={len(skipped)}"
                        )
                        break
                elif import_type == "products":
                    unmatched = business.get("unmatched", 0)
                    if unmatched not in (None, 0, [], {}):
                        last_error = f"Odoo product receipt contains unmatched products: {unmatched}"
                        break
            return data
        raise OdooIntegrationError(last_error)
