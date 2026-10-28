import asyncio
from typing import Any

import httpx


class OdooIntegrationError(RuntimeError):
    pass


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
    ) -> dict[str, Any]:
        if not self.enabled:
            raise OdooIntegrationError("Odoo import is disabled")
        if not self.base_url or not self.token:
            raise OdooIntegrationError("Odoo integration URL/token is not configured")
        params = {"type": import_type, "store_key": store_key, "business_write": self.business_write, "items": items}
        if import_type == "inventory" and snapshot_complete:
            params.update({"replace": True, "snapshot_complete": True})
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
            if result.get("ok") is True:
                return data
            last_error = str(result.get("error", "Odoo response did not confirm a successful import"))
            if last_error != "unauthorized":
                break
        raise OdooIntegrationError(last_error)
