import asyncio
import re
from datetime import date, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx


class ShopfrontError(RuntimeError):
    pass


# Keep the crawler's built-in catalog query independent from an old deployment
# override. The response retains source fields verbatim, while pageInfo lets us
# walk every product instead of silently stopping at the first 100.
CATALOG_QUERY = """
query ShopfrontCatalog($after: Cursor) {
  products(first: 100, after: $after) {
    edges { node {
      id name mdbId status type description image alternateImages createdAt updatedAt deletedAt deleted
      tempProduct useScales useBarcodeTemplates usePriceLabel requestQuantity requestPrice minimumOrderQuantity
      orderNotes invoiceNotes preventManualDiscounts ignorePriceHostChanges ignoreBarcodeHostChanges
      category { id name } brand { id name } family { id name } tags { name }
      trackInventory caseQuantity cost lastCost averageCost globalCost globalLastCost globalAverageCost
      replacementCost costPercentage
      prices { quantity price priceEx decimalPlaceLength priceSet { id name } }
      barcodes { code quantity } taxRate { id name } costTaxRate { id name }
      inventory { outlet { id name } quantity singleLevel caseLevel reorderLevel
        reorderAmount reorderLimit maxQuantity onOrder }
    } }
    pageInfo { hasNextPage endCursor }
  }
}
"""

INVENTORY_QUERY = """
query ShopfrontInventory($after: Cursor) {
  products(first: 100, after: $after) {
    edges { node {
      id name mdbId
      inventory { outlet { id name } quantity singleLevel caseLevel reorderLevel
        reorderAmount reorderLimit maxQuantity onOrder }
    } }
    pageInfo { hasNextPage endCursor }
  }
}
"""


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
            if requests > 12:
                raise ShopfrontError("Incomplete report did not complete after 12 polls")
            payload: dict[str, Any] = {"key": key} if key else {"query": query, "disableFormat": False, "ignoreDivisionByZero": True}
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
        query = f'''SELECT BY_NAME, revenue, cost, timestamp
FROM sales
BY outlet
START '{start}'
END '{end}'
UNCONSOLIDATED'''
        try:
            return await self.run_report(access_token, query)
        except ShopfrontError:
            if start != end:
                raise
            # A few historical business dates reject an end date without a
            # time component. Retry that single-day window explicitly.
            fallback = f'''SELECT BY_NAME, revenue, cost, timestamp
FROM sales
BY outlet
START '{start} 00:00:00'
END '{end} 23:59:59'
UNCONSOLIDATED'''
            try:
                return await self.run_report(access_token, fallback)
            except ShopfrontError:
                # Some older records only accept a date-to-date window. The
                # caller upserts by source ID, so the adjacent-day response is
                # safe and preserves the target business date.
                next_day = (date.fromisoformat(end) + timedelta(days=1)).isoformat()
                adjacent = f'''SELECT BY_NAME, revenue, cost, timestamp
FROM sales
BY outlet
START '{start}'
END '{next_day}'
UNCONSOLIDATED'''
                return await self.run_report(access_token, adjacent)

    async def fetch_sales_graphql(self, access_token: str, start: str, end: str) -> list[dict[str, Any]]:
        """Fetch complete sales; Reporting API rows do not include stable Sale IDs."""
        query = """
        query GetSales($startDate: DateTime, $endDate: DateTime, $after: Cursor) {
          sales(startDate: $startDate, endDate: $endDate, after: $after) {
            edges { node {
              id clientId status invoiceId totalCost totalDiscount totalTax totalPrice createdAt updatedAt
              items { id quantity cost basePrice tax totalPrice item { id ... on Product { name description image alternateImages
                mdbId status type createdAt updatedAt deletedAt deleted
                tempProduct useScales useBarcodeTemplates usePriceLabel requestQuantity requestPrice minimumOrderQuantity
                orderNotes invoiceNotes preventManualDiscounts ignorePriceHostChanges ignoreBarcodeHostChanges
                category { id name } brand { id name } family { id name } tags { name }
                trackInventory caseQuantity cost lastCost averageCost globalCost globalLastCost globalAverageCost replacementCost costPercentage
                prices { quantity price priceEx decimalPlaceLength priceSet { id name } }
                barcodes { code quantity } taxRate { id name } costTaxRate { id name }
                inventory { outlet { id name } quantity singleLevel caseLevel reorderLevel reorderAmount reorderLimit maxQuantity onOrder }
              } } }
              payments { id amount status subtype }
            } }
            pageInfo { hasNextPage endCursor }
          }
        }
        """
        start_value = f"{start}T00:00:00Z"
        end_value = f"{end}T23:59:59Z"
        variables = {"startDate": start_value, "endDate": end_value}
        try:
            return await self._fetch_connection_nodes(access_token, query, "sales", variables)
        except ShopfrontError:
            # Optional Product fields differ between Shopfront tenants. Keep
            # core Sale, item name, barcode, and payment sync available.
            basic_query = """
            query GetSales($startDate: DateTime, $endDate: DateTime, $after: Cursor) {
              sales(startDate: $startDate, endDate: $endDate, after: $after) {
                edges { node {
                  id clientId status invoiceId totalCost totalDiscount totalTax totalPrice createdAt updatedAt
                  items { id quantity cost basePrice tax totalPrice item { id ... on Product { name description image alternateImages barcodes { code quantity } } } }
                  payments { id amount status subtype }
                } }
                pageInfo { hasNextPage endCursor }
              }
            }
            """
            return await self._fetch_connection_nodes(access_token, basic_query, "sales", variables)

    async def fetch_products(self, access_token: str, query: str) -> list[dict[str, Any]]:
        try:
            nodes = await self._fetch_connection_nodes(access_token, query, "products")
        except ShopfrontError:
            # Shopfront rejects a complete GraphQL page when one optional
            # field is unavailable for a tenant. Keep the catalog usable with
            # fields supported by the current production schema.
            fallback = """
            { products(first: 100) { edges { node {
              id name description image alternateImages status cost globalCost
              prices { price } barcodes { code quantity }
              category { name } brand { name }
              inventory { quantity outlet { id name } }
            } } } }
            """
            nodes = await self._fetch_connection_nodes(access_token, fallback, "products")

        # Optional fields are queried independently. Shopfront GraphQL rejects
        # a whole selection when one field is unavailable for a tenant, so a
        # problem in one group must not discard the base catalog page.
        optional_queries = (
            # Keep metadata independent from SHOPFRONT_PRODUCTS_QUERY. A
            # deployment may override that variable with a small query, but
            # the crawler must still attempt to fetch every supported catalog
            # field before deciding that it is unavailable.
            "{ products(first: 100) { edges { node { id name description image alternateImages mdbId status type createdAt updatedAt deletedAt deleted tempProduct } } } }",
            "{ products(first: 100) { edges { node { id category { id name } brand { id name } family { id name } tags { name } } } } }",
            "{ products(first: 100) { edges { node { id trackInventory caseQuantity useScales useBarcodeTemplates usePriceLabel requestQuantity requestPrice minimumOrderQuantity preventManualDiscounts ignorePriceHostChanges ignoreBarcodeHostChanges orderNotes invoiceNotes } } } }",
            "{ products(first: 100) { edges { node { id cost lastCost averageCost globalCost globalLastCost globalAverageCost replacementCost costPercentage } } } }",
            "{ products(first: 100) { edges { node { id prices { quantity price priceEx decimalPlaceLength priceSet { id name } } } } } }",
            "{ products(first: 100) { edges { node { id barcodes { code quantity } taxRate { id name } costTaxRate { id name } } } } }",
            "{ products(first: 100) { edges { node { id suppliers { id name } coreSupplier { id name } lastSupplier { id name } } } } }",
            "{ products(first: 100) { edges { node { id inventory { quantity singleLevel caseLevel outlet { id name } } } } } }",
            "{ products(first: 100) { edges { node { id inventory { quantity reorderLevel outlet { id name } } } } } }",
            "{ products(first: 100) { edges { node { id inventory { quantity reorderAmount reorderLimit outlet { id name } } } } } }",
            "{ products(first: 100) { edges { node { id inventory { quantity maxQuantity onOrder outlet { id name } } } } } }",
        )
        merged = {str(node.get("id")): dict(node) for node in nodes if isinstance(node, dict) and node.get("id")}
        # The configured/default query already requests almost every safe
        # catalog field. Re-running every optional selection for all pages
        # multiplies a catalog sync into hundreds of unnecessary requests.
        # Only issue a supplemental query when its fields are absent from the
        # original selection. A field present with a null value is still a
        # valid response and must not trigger another full catalog scan.
        optional_requirements = (
            ("mdbId", "status", "type", "createdAt", "updatedAt", "deletedAt", "deleted", "tempProduct"),
            ("category", "brand", "family", "tags"),
            ("trackInventory", "caseQuantity", "useScales", "useBarcodeTemplates", "usePriceLabel", "requestQuantity", "requestPrice", "minimumOrderQuantity", "preventManualDiscounts", "ignorePriceHostChanges", "ignoreBarcodeHostChanges", "orderNotes", "invoiceNotes"),
            ("cost", "lastCost", "averageCost", "globalCost", "globalLastCost", "globalAverageCost", "replacementCost", "costPercentage"),
            ("prices", "quantity", "price", "priceEx", "decimalPlaceLength", "priceSet"),
            ("barcodes", "code", "quantity", "taxRate", "costTaxRate"),
            ("suppliers", "coreSupplier", "lastSupplier"),
            ("inventory", "singleLevel", "caseLevel", "outlet"),
            ("inventory", "reorderLevel"),
            ("inventory", "reorderAmount", "reorderLimit"),
            ("inventory", "maxQuantity", "onOrder"),
        )
        for index, optional_query in enumerate(optional_queries):
            requirement = optional_requirements[index]
            if all(re.search(rf"\b{re.escape(field)}\b", query) for field in requirement):
                continue
            try:
                for node in await self._fetch_connection_nodes(access_token, optional_query, "products"):
                    if not isinstance(node, dict) or not node.get("id"):
                        continue
                    target = merged.get(str(node["id"]))
                    if target is not None:
                        for key, value in node.items():
                            if value is None:
                                continue
                            if key != "inventory" or not isinstance(value, list):
                                target[key] = value
                                continue
                            current = {
                                str(row.get("outlet", {}).get("id")): dict(row)
                                for row in (target.get("inventory") or [])
                                if isinstance(row, dict) and isinstance(row.get("outlet"), dict) and row.get("outlet", {}).get("id")
                            }
                            for row in value:
                                if not isinstance(row, dict):
                                    continue
                                outlet_id = str((row.get("outlet") or {}).get("id", ""))
                                current.setdefault(outlet_id, {}).update(row)
                            target["inventory"] = list(current.values())
            except ShopfrontError:
                continue
        return list(merged.values())

    async def _fetch_connection_nodes(
        self,
        access_token: str,
        query: str,
        field: str,
        variables: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        paged_query = _add_cursor_pagination(query, field)
        result: list[dict[str, Any]] = []
        after: str | None = None
        seen_cursors: set[str] = set()
        while True:
            request_variables = dict(variables or {})
            request_variables["after"] = after
            data = await self.graphql(access_token, paged_query, request_variables)
            connection = data.get(field, {}) if isinstance(data, dict) else {}
            edges = connection.get("edges", []) if isinstance(connection, dict) else []
            result.extend(
                edge["node"]
                for edge in edges
                if isinstance(edge, dict) and isinstance(edge.get("node"), dict)
            )
            page_info = connection.get("pageInfo", {}) if isinstance(connection, dict) else {}
            if not page_info.get("hasNextPage"):
                return result
            next_cursor = page_info.get("endCursor")
            if not next_cursor or str(next_cursor) in seen_cursors:
                raise ShopfrontError(f"Shopfront {field} pagination returned a missing or repeated cursor")
            seen_cursors.add(str(next_cursor))
            after = str(next_cursor)

    async def fetch_products_by_ids(self, access_token: str, product_ids: list[str]) -> list[dict[str, Any]]:
        """Fetch products referenced by history, including archived products."""
        ids = [str(value).strip() for value in product_ids if str(value).strip()]
        if not ids:
            return []
        fields = """
          id name mdbId status type description image alternateImages createdAt updatedAt deletedAt deleted
          tempProduct useScales useBarcodeTemplates usePriceLabel requestQuantity requestPrice minimumOrderQuantity
          orderNotes invoiceNotes preventManualDiscounts ignorePriceHostChanges ignoreBarcodeHostChanges
          category { id name } brand { id name } family { id name } tags { name }
          suppliers { id name } coreSupplier { id name } lastSupplier { id name }
          trackInventory caseQuantity cost lastCost averageCost globalCost globalLastCost globalAverageCost replacementCost costPercentage
          prices { quantity price priceEx decimalPlaceLength priceSet { id name } }
          barcodes { code quantity } taxRate { id name } costTaxRate { id name }
          inventory { outlet { id name } quantity singleLevel caseLevel reorderLevel
            reorderAmount reorderLimit maxQuantity onOrder }
        """
        queries = [fields, "id name mdbId status description image alternateImages prices { quantity price priceEx } barcodes { code quantity }"]
        last_error: Exception | None = None
        for selection in queries:
            query = f"""
            query ProductsByIds($ids: [ID], $after: Cursor) {{
              products(products: $ids, first: 100, after: $after) {{
                edges {{ node {{ {selection} }} }}
                pageInfo {{ hasNextPage endCursor }}
              }}
            }}
            """
            try:
                result: list[dict[str, Any]] = []
                after: str | None = None
                seen: set[str] = set()
                while True:
                    data = await self.graphql(access_token, query, {"ids": ids, "after": after})
                    connection = data.get("products", {}) if isinstance(data, dict) else {}
                    result.extend(edge.get("node", {}) for edge in connection.get("edges", []) if isinstance(edge, dict) and isinstance(edge.get("node"), dict))
                    page_info = connection.get("pageInfo", {}) if isinstance(connection, dict) else {}
                    if not page_info.get("hasNextPage"):
                        return result
                    next_cursor = str(page_info.get("endCursor") or "")
                    if not next_cursor or next_cursor in seen:
                        raise ShopfrontError("Shopfront product ID pagination returned a repeated cursor")
                    seen.add(next_cursor)
                    after = next_cursor
            except Exception as exc:
                last_error = exc
        raise ShopfrontError(f"Shopfront product ID query failed: {last_error}")

    async def fetch_products_by_ids(self, access_token: str, product_ids: list[str]) -> list[dict[str, Any]]:
        """Fetch products referenced by history, including archived products."""
        ids = [str(value).strip() for value in product_ids if str(value).strip()]
        if not ids:
            return []
        fields = """
          id name mdbId status type description image alternateImages createdAt updatedAt deletedAt deleted
          tempProduct useScales useBarcodeTemplates usePriceLabel requestQuantity requestPrice minimumOrderQuantity
          orderNotes invoiceNotes preventManualDiscounts ignorePriceHostChanges ignoreBarcodeHostChanges
          category { id name } brand { id name } family { id name } tags { name }
          suppliers { id name } coreSupplier { id name } lastSupplier { id name }
          trackInventory caseQuantity cost lastCost averageCost globalCost globalLastCost globalAverageCost replacementCost costPercentage
          prices { quantity price priceEx decimalPlaceLength priceSet { id name } }
          barcodes { code quantity } taxRate { id name } costTaxRate { id name }
          inventory { outlet { id name } quantity singleLevel caseLevel reorderLevel
            reorderAmount reorderLimit maxQuantity onOrder }
        """
        queries = [fields, "id name mdbId status description image alternateImages prices { quantity price priceEx } barcodes { code quantity }"]
        last_error: Exception | None = None
        for selection in queries:
            query = f"""
            query ProductsByIds($ids: [ID], $after: Cursor) {{
              products(products: $ids, first: 100, after: $after) {{
                edges {{ node {{ {selection} }} }}
                pageInfo {{ hasNextPage endCursor }}
              }}
            }}
            """
            try:
                result: list[dict[str, Any]] = []
                after: str | None = None
                seen: set[str] = set()
                while True:
                    data = await self.graphql(access_token, query, {"ids": ids, "after": after})
                    connection = data.get("products", {}) if isinstance(data, dict) else {}
                    result.extend(edge.get("node", {}) for edge in connection.get("edges", []) if isinstance(edge, dict) and isinstance(edge.get("node"), dict))
                    page_info = connection.get("pageInfo", {}) if isinstance(connection, dict) else {}
                    if not page_info.get("hasNextPage"):
                        return result
                    next_cursor = str(page_info.get("endCursor") or "")
                    if not next_cursor or next_cursor in seen:
                        raise ShopfrontError("Shopfront product ID pagination returned a repeated cursor")
                    seen.add(next_cursor)
                    after = next_cursor
            except Exception as exc:
                last_error = exc
        raise ShopfrontError(f"Shopfront product ID query failed: {last_error}")

    async def fetch_inventory(self, access_token: str, query: str) -> list[dict[str, Any]]:
        return await self._fetch_connection_nodes(access_token, query, "products")

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


def _add_cursor_pagination(query: str, field: str) -> str:
    selector = re.compile(rf"\b{re.escape(field)}\s*\(\s*first\s*:\s*(\d+)(?:\s*,\s*after\s*:\s*\$after)?\s*\)")
    match = selector.search(query)
    if not match:
        already_paginated = re.search(rf"\b{re.escape(field)}\s*\([^)]*\bafter\s*:\s*\$after", query)
        declared_cursor = re.search(r"\$after\s*:\s*Cursor\b", query)
        if already_paginated and declared_cursor and "pageInfo" in query:
            return query
        raise ShopfrontError(f"Shopfront {field} query must select a paginated connection with first: N")
    paged = selector.sub(lambda found: f"{field}(first: {found.group(1)}, after: $after)", query, count=1)
    opening = paged.find("{", match.end())
    if opening < 0:
        raise ShopfrontError(f"Shopfront {field} query has no connection selection")
    depth = 0
    closing = -1
    for index in range(opening, len(paged)):
        if paged[index] == "{":
            depth += 1
        elif paged[index] == "}":
            depth -= 1
            if depth == 0:
                closing = index
                break
    if closing < 0:
        raise ShopfrontError(f"Shopfront {field} query has unbalanced selections")
    if "pageInfo" not in paged[opening:closing]:
        paged = f"{paged[:closing]} pageInfo {{ hasNextPage endCursor }} {paged[closing:]}"
    if paged.lstrip().startswith("{"):
        return f"query CursorPage($after: Cursor) {paged}"
    if not re.search(r"\$after\s*:\s*Cursor\b", paged):
        raise ShopfrontError(f"Shopfront {field} operation must declare $after: Cursor")
    return paged
