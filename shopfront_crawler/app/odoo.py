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

    async def sync(self, import_type: str, store_key: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        if not self.enabled:
            raise OdooIntegrationError("Odoo import is disabled")
        if not self.base_url or not self.token:
            raise OdooIntegrationError("Odoo integration URL/token is not configured")
        payload = {
            "jsonrpc": "2.0",
            "method": "call",
            "params": {"type": import_type, "store_key": store_key, "business_write": self.business_write, "items": items},
            "id": None,
        }
        tokens = [self.token] + ([self.fallback_token] if self.fallback_token else [])
        last_error = "Odoo import failed"
        for token in tokens:
            response = await self.http.post(
                f"{self.base_url}/api/shopfront/sync",
                json=payload,
                headers={"X-Shopfront-Integration-Token": token, "X-Odoo-Database": self.database, "Accept": "application/json"},
            )
            if response.status_code >= 400:
                last_error = f"Odoo API failed ({response.status_code}): {response.text[:500]}"
                continue
            data = response.json()
            result = data.get("result") if isinstance(data, dict) and isinstance(data.get("result"), dict) else data
            if result.get("ok") is not False:
                return data
            last_error = str(result.get("error", "Odoo import failed"))
            if last_error != "unauthorized":
                break
        raise OdooIntegrationError(last_error)
