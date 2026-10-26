import asyncio
from typing import Any
from urllib.parse import urlencode

import httpx


class ShopfrontError(RuntimeError):
    pass


class ShopfrontClient:
    def __init__(self, vendor: str, client_id: str, client_secret: str, redirect_uri: str, scopes: str, http: httpx.AsyncClient | None = None):
        self.vendor = vendor
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.scopes = scopes
        self.http = http or httpx.AsyncClient(timeout=60)

    @property
    def base_url(self) -> str:
        return f"https://{self.vendor}.onshopfront.com"

    def authorization_url(self, state: str) -> str:
        params = {"client_id": self.client_id, "redirect_uri": self.redirect_uri, "response_type": "code", "scope": self.scopes, "state": state}
        return f"{self.base_url}/oauth/authorize?{urlencode(params)}"

    async def close(self) -> None:
        await self.http.aclose()

    async def _token_request(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self.http.post("https://onshopfront.com/oauth/token", json=payload)
        if response.status_code >= 400:
            raise ShopfrontError(f"Shopfront token request failed ({response.status_code})")
        data = response.json()
        if "access_token" not in data:
            raise ShopfrontError("Shopfront token response has no access_token")
        return data

    async def exchange_code(self, code: str) -> dict[str, Any]:
        return await self._token_request({"client_id": self.client_id, "client_secret": self.client_secret, "code": code, "redirect_uri": self.redirect_uri, "grant_type": "authorization_code"})

    async def refresh_token(self, refresh_token: str) -> dict[str, Any]:
        return await self._token_request({"client_id": self.client_id, "client_secret": self.client_secret, "refresh_token": refresh_token, "grant_type": "refresh_token"})

    async def _request(self, path: str, access_token: str, **kwargs: Any) -> httpx.Response:
        headers = kwargs.pop("headers", {})
        headers.update({"Authorization": f"Bearer {access_token}", "Accept": "application/json", "Content-Type": "application/json", "User-Agent": "OrithosShopfrontCrawler/0.1"})
        response = await self.http.post(f"{self.base_url}{path}", headers=headers, **kwargs)
        if response.status_code == 429:
            retry_after = response.headers.get("Retry-After")
            wait_seconds = int(retry_after) if retry_after and retry_after.isdigit() else 60
            await asyncio.sleep(min(wait_seconds, 120))
            response = await self.http.post(f"{self.base_url}{path}", headers=headers, **kwargs)
            if response.status_code == 429:
                raise ShopfrontError(f"Shopfront rate limit; retry after {response.headers.get('Retry-After', 'unknown')} seconds")
        if response.status_code >= 400:
            raise ShopfrontError(f"Shopfront API failed ({response.status_code}): {response.text[:500]}")
        return response

    async def run_report(self, access_token: str, query: str) -> list[dict[str, Any]]:
        pages: list[dict[str, Any]] = []
        key: str | None = None
        requests = 0
        while True:
            requests += 1
            if requests > 120:
                raise ShopfrontError("Incomplete report exceeded 120 requests")
            payload: dict[str, Any] = {"query": query, "disableFormat": False, "ignoreDivisionByZero": True}
            if key:
                payload["key"] = key
            data = (await self._request("/api/v2/reports", access_token, json=payload)).json()
            if data.get("error"):
                raise ShopfrontError(data.get("message", "Shopfront report failed"))
            if data.get("completed", True):
                # A report can return the same continuation key while the
                # asynchronous page is still being prepared. Replace that
                # in-flight page instead of duplicating its rows.
                if pages and key and data.get("key") == key:
                    pages[-1] = data
                else:
                    pages.append(data)
                break
            next_key = data.get("key")
            if not next_key:
                raise ShopfrontError("Incomplete report has no continuation key")
            if pages and key == next_key:
                pages[-1] = data
                # Reporting is limited to 10 requests per minute. Repeated
                # keys mean the server is still preparing this same page.
                await asyncio.sleep(6)
            else:
                pages.append(data)
            key = next_key
        rows: list[dict[str, Any]] = []
        for page in pages:
            report_data = (page.get("data") or {}).get("data", [])
            rows.extend(report_data if isinstance(report_data, list) else _flatten_grouped(report_data))
        return rows

    async def graphql(self, access_token: str, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        data = (await self._request("/api/v2/graphql", access_token, json={"query": query, "variables": variables or {}})).json()
        if data.get("errors"):
            raise ShopfrontError(str(data["errors"]))
        return data.get("data", data)

    async def fetch_sales(self, access_token: str, start: str, end: str) -> list[dict[str, Any]]:
        query = f'''SELECT BY_NAME, revenue, cost, revenue - cost AS "Profit", timestamp
FROM sales
BY outlet
START '{start}'
END '{end}'
UNCONSOLIDATED'''
        return await self.run_report(access_token, query)

    async def fetch_sales_graphql(self, access_token: str, start: str, end: str) -> list[dict[str, Any]]:
        """Fetch complete sales; Reporting API rows do not include stable Sale IDs."""
        query = """
        query GetSales($startDate: DateTime, $endDate: DateTime, $after: Cursor) {
          sales(startDate: $startDate, endDate: $endDate, after: $after) {
            edges { node {
              id clientId status invoiceId totalCost totalDiscount totalTax totalPrice createdAt updatedAt
              items { id quantity cost basePrice tax totalPrice item { id } }
              payments { id amount status subtype }
            } }
            pageInfo { hasNextPage endCursor }
          }
        }
        """
        start_value = f"{start}T00:00:00Z"
        end_value = f"{end}T23:59:59Z"
        result: list[dict[str, Any]] = []
        after: str | None = None
        while True:
            data = await self.graphql(access_token, query, {"startDate": start_value, "endDate": end_value, "after": after})
            connection = data.get("sales", {}) if isinstance(data, dict) else {}
            edges = connection.get("edges", []) if isinstance(connection, dict) else []
            result.extend(edge.get("node", {}) for edge in edges if isinstance(edge, dict) and isinstance(edge.get("node"), dict))
            page_info = connection.get("pageInfo", {}) if isinstance(connection, dict) else {}
            if not page_info.get("hasNextPage") or not page_info.get("endCursor"):
                return result
            after = page_info["endCursor"]

    async def fetch_products(self, access_token: str, query: str) -> list[dict[str, Any]]:
        return _extract_nodes(await self.graphql(access_token, query), "products")

    async def fetch_inventory(self, access_token: str, query: str) -> list[dict[str, Any]]:
        return _extract_nodes(await self.graphql(access_token, query), "products")

    async def fetch_sale_detail(self, access_token: str, sale_id: str, query: str) -> dict[str, Any]:
        data = await self.graphql(access_token, query, {"id": sale_id})
        return data.get("sale", data)

    async def register_webhook(self, access_token: str, mutation: str, variables: dict[str, Any]) -> dict[str, Any]:
        return await self.graphql(access_token, mutation, variables)


def _flatten_grouped(group: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for child in group.values():
        if isinstance(child, dict) and isinstance(child.get("data"), list):
            rows.extend(child["data"])
        elif isinstance(child, dict) and isinstance(child.get("data"), dict):
            rows.extend(_flatten_grouped(child["data"]))
    return rows


def _extract_nodes(data: dict[str, Any], key: str) -> list[dict[str, Any]]:
    value = data.get(key, data)
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        if isinstance(value.get("nodes"), list):
            return value["nodes"]
        if isinstance(value.get("edges"), list):
            return [edge.get("node", {}) for edge in value["edges"]]
    return []
