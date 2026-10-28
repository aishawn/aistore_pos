import asyncio
from typing import Any

import httpx


class PosIntegrationError(RuntimeError):
    pass


class OrithosClient:
    """Client for the isolated Orithos integration boundary.

    The API is deliberately disabled unless POS_IMPORT_ENABLED is true. This
    prevents a crawler deployment from writing business data accidentally.
    """

    def __init__(self, base_url: str, token: str, enabled: bool, http: httpx.AsyncClient | None = None):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.enabled = enabled
        self.http = http or httpx.AsyncClient(timeout=60)

    async def close(self) -> None:
        await self.http.aclose()

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.enabled:
            raise PosIntegrationError("Orithos import is disabled; set POS_IMPORT_ENABLED=true after staging validation")
        if not self.base_url or not self.token:
            raise PosIntegrationError("Orithos POS API URL/token is not configured")
        response = None
        for attempt in range(10):
            try:
                response = await self.http.post(
                    f"{self.base_url}{path}",
                    json=payload,
                    headers={"X-Shopfront-Integration-Token": self.token, "Accept": "application/json"},
                )
                if response.status_code not in {502, 503, 504}:
                    break
            except (httpx.ConnectError, httpx.ReadTimeout, httpx.RemoteProtocolError) as exc:
                if attempt == 9:
                    raise PosIntegrationError(f"Orithos connection failed: {exc!r}") from exc
            if attempt < 9:
                await asyncio.sleep(min(30, 2 ** attempt))
        if response is None:
            raise PosIntegrationError("Orithos connection failed after retries")
        if response.status_code >= 400:
            raise PosIntegrationError(f"Orithos API failed ({response.status_code}): {response.text[:500]}")
        return response.json()

    async def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        if not self.enabled:
            raise PosIntegrationError("Orithos import is disabled; set POS_IMPORT_ENABLED=true after staging validation")
        if not self.base_url or not self.token:
            raise PosIntegrationError("Orithos POS API URL/token is not configured")
        response = await self.http.get(
            f"{self.base_url}{path}",
            params=params,
            headers={"X-Shopfront-Integration-Token": self.token, "Accept": "application/json"},
        )
        if response.status_code >= 400:
            raise PosIntegrationError(f"Orithos API failed ({response.status_code}): {response.text[:500]}")
        return response.json()

    async def upsert_products(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._post("/api/integrations/shopfront/products:upsert", payload)

    async def replace_inventory(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._post("/api/integrations/shopfront/inventory:replace", payload)

    async def upsert_sales(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._post("/api/integrations/shopfront/sales:upsert", payload)

    async def snapshot(self, store_key: str) -> dict[str, Any]:
        return await self._get("/api/integrations/shopfront/snapshot", {"storeKey": store_key})

    async def match_status(self, store_key: str) -> dict[str, Any]:
        return await self._get("/api/integrations/shopfront/match-status", {"storeKey": store_key})
