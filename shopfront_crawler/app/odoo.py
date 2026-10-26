from typing import Any

import httpx


class OdooIntegrationError(RuntimeError):
    pass


class OdooSyncClient:
    def __init__(self, base_url: str, token: str, enabled: bool, http: httpx.AsyncClient | None = None):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.enabled = enabled
        self.http = http or httpx.AsyncClient(timeout=90)

    async def close(self) -> None:
        await self.http.aclose()

    async def sync(self, import_type: str, store_key: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        if not self.enabled:
            raise OdooIntegrationError("Odoo import is disabled")
        if not self.base_url or not self.token:
            raise OdooIntegrationError("Odoo integration URL/token is not configured")
        response = await self.http.post(
            f"{self.base_url}/api/shopfront/sync",
            json={"type": import_type, "store_key": store_key, "items": items},
            headers={"X-Shopfront-Integration-Token": self.token, "Accept": "application/json"},
        )
        if response.status_code >= 400:
            raise OdooIntegrationError(f"Odoo API failed ({response.status_code}): {response.text[:500]}")
        data = response.json()
        if data.get("ok") is False:
            raise OdooIntegrationError(str(data.get("error", "Odoo import failed")))
        return data
