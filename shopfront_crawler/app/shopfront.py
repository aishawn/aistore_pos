import asyncio
import re
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

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

SUPPLIERS_QUERY = """
# Contact.name is not exposed by every Shopfront tenant; use portable fields.
query ShopfrontSuppliers($after: Cursor) {
  suppliers(first: 100, after: $after) {
    edges { node { id name mdbId status businessNumber orderNotes comments
      defaultOrderTax minimumOrderValue maximumOrderValue defaultDaysUntilDue
      contact { email phone } } }
    pageInfo { hasNextPage endCursor }
  }
}
"""

PURCHASE_ORDERS_QUERY = """
query ShopfrontPurchaseOrders($after: Cursor) {
  orders(type: ORDER, first: 100, after: $after) {
    edges { node { id type status completed undergoingReview orderDate dueDate
      invoiceNumber reference includeFreight totalCost
      lineCount expectedTotal createdAt sentAt receivedAt
      products { caseQuantity orderedQuantity receivedQuantity baseCost orderedCost
        supplier { id name }
        item { id name mdbId } } } }
    pageInfo { hasNextPage endCursor }
  }
}
"""

CUSTOMERS_QUERY = """
query ShopfrontCustomers($after: Cursor) {
  customers(first: 100, after: $after) {
    edges { node {
      id clientId code name firstName lastName company businessNumber
      birthday gender billing { email phone } delivery { email phone }
      emails fax phone mobile allowMarketingEmails website invoiceMessage comments
      customerGroup { id name } loyaltyEnabled loyaltyRate loyaltyPoints
      disablePromotions priceList { id name } requireOrderReference
      accountLimit currentOwing overrideCustomerGroup deleted createdAt updatedAt
    } }
    pageInfo { hasNextPage endCursor }
  }
}
"""

CUSTOMER_GROUPS_QUERY = """
{ customerGroups {
  id name
  defaultReceipt { id name type components receiptWidth accountReceipt padding { top left right bottom } attachments { id name attachment { id name } } }
  emailReceipt { id name type components receiptWidth accountReceipt padding { top left right bottom } attachments { id name attachment { id name } } }
  paymentReceipt { id name type components receiptWidth accountReceipt padding { top left right bottom } attachments { id name attachment { id name } } }
  statementTemplate { id name components signature replyTo subject }
  loyaltyEnabled loyaltyRate disablePromotions priceList { id name }
  allowAccountSales accountLimit autoPrintReceipt autoPrintPaymentReceipt
  autoPrintParkedReceipt autoEmailReceipt requireOrderReference creditTerms
  createdAt updatedAt
} }
"""

PRICE_LISTS_QUERY = """
{ priceLists {
  id name allowHigherPrice allowDiscountingPromotions createdAt updatedAt
  items {
    exclude type rule amount prices { quantity price }
    item {
      __typename
      ... on Product { id name mdbId }
      ... on Category { id name mdbId }
      ... on Brand { id name mdbId }
      ... on Family { id name mdbId }
      ... on Tag { id name mdbId }
      ... on PriceListFallback { fallbackId: id }
    }
    minRule minAmount minPrices { quantity price }
  }
} }
"""

CLASSIFICATION_QUERIES = {
    "brands": "{ brands(first: 100) { edges { node { id name parent deleted mdbId } } } }",
    "categories": "{ categories(first: 100) { edges { node { id name parent deleted mdbId metcashMSC } } } }",
    "families": "{ families(first: 100) { edges { node { id name parent deleted mdbId deletedAt } } } }",
    "tags": "{ tags(first: 100) { edges { node { id name parent deleted mdbId } } } }",
}

CUSTOMER_PAYMENTS_QUERY = """
query ShopfrontCustomerPayments($after: Cursor) {
  customerPayments(first: 100, after: $after) {
    edges { node {
      id reference status startBalance amount rounding timestamp cancelledAt
      customer { id clientId } paymentMethod { id name } user { id }
      register { id } relatesTo { id }
    } }
    pageInfo { hasNextPage endCursor }
  }
}
"""

SAVED_REPORTS_QUERY = """
{ reports {
  id name layers nextEmailDate syntaxErrors createdAt updatedAt
} }
"""

EXTENDED_CONNECTION_QUERIES = {
    "promotions": """query ShopfrontPromotions($after: Cursor) {
      promotions(showInactive: true, first: 100, after: $after) { edges { node {
      id mdbId mdbSyncing clientId name start end express mixCriteria active
      saleMaxApplicationCount activatedBy promotionCategory { id name }
      customerGroups { id name } outlets { id name }
      criteria { buyAmount buyAmountMax buyAmountType discountAmount discountEverydayPromotions
        excludeCountQuantity excludePricePoints minQuantity mixedOnly optional quantityType type
        items { exclude rebate item { __typename ... on Product { id name mdbId }
          ... on Category { id name mdbId } ... on Brand { id name mdbId }
          ... on Family { id name mdbId } ... on Tag { id name mdbId } } } }
      schedule { anchor period offset duration }
    } } pageInfo { hasNextPage endCursor } }
    }
    """,
    "product_backorders": """{ productBackorders(first: 100) { edges { node {
      id quantity recurringPeriod nextDueDate notes
    } } pageInfo { hasNextPage endCursor } } }""",
    "stocktakes": """{ stocktakes(first: 100) { edges { node { id name type status displayExpected } }
      pageInfo { hasNextPage endCursor } } }""",
    "external_stocktakes": """{ externalStocktakes(first: 100) { edges { node {
      id zeroStock overrideStock status timestamp
    } } pageInfo { hasNextPage endCursor } } }""",
    "closures": """{ closures(first: 100) { edges { node {
      id movement totalExpected totalReceived totalTransactions
    } } pageInfo { hasNextPage endCursor } } }""",
}

EXTENDED_CONNECTION_ROOTS = {
    "product_backorders": "productBackorders",
    "external_stocktakes": "externalStocktakes",
}

EXTENDED_LIST_QUERIES = {
    "outlets": "{ outlets { id name } }",
    "registers": "{ registers { id name invoiceNumber openTime closed } }",
    "customer_groups": CUSTOMER_GROUPS_QUERY,
    "price_lists": PRICE_LISTS_QUERY,
    "saved_reports": SAVED_REPORTS_QUERY,
}


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
        url = f"{self.base_url}{path}"
        max_attempts = 3
        for attempt in range(max_attempts):
            try:
                response = await self.http.post(url, headers=headers, **kwargs)
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                if attempt == max_attempts - 1:
                    raise ShopfrontError(f"Shopfront request failed after {max_attempts} attempts: {exc}") from exc
                await asyncio.sleep(2 ** attempt)
                continue

            if response.status_code == 429:
                retry_after = response.headers.get("Retry-After")
                wait_seconds = int(retry_after) if retry_after and retry_after.isdigit() else 60
                if attempt == max_attempts - 1:
                    raise ShopfrontError(f"Shopfront rate limit; retry after {response.headers.get('Retry-After', 'unknown')} seconds")
                await asyncio.sleep(min(wait_seconds, 120))
                continue

            if response.status_code in {500, 502, 503, 504}:
                if attempt == max_attempts - 1:
                    raise ShopfrontError(f"Shopfront API failed ({response.status_code}): {response.text[:500]}")
                retry_after = response.headers.get("Retry-After")
                wait_seconds = int(retry_after) if retry_after and retry_after.isdigit() else 2 ** attempt
                await asyncio.sleep(min(wait_seconds, 30))
                continue

            if response.status_code >= 400:
                raise ShopfrontError(f"Shopfront API failed ({response.status_code}): {response.text[:500]}")
            return response

        raise ShopfrontError("Shopfront request failed without a response")

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
        query = f'''SELECT BY_NAME, revenue, cost, transaction_count,
FORMAT(revenue / transaction_count, '$') AS average_sale,
profit, FORMAT((revenue - cost) / revenue * 100, '', '%', 2) AS profit_percentage,
tax, discount
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
            fallback = f'''SELECT BY_NAME, revenue, cost
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
                adjacent = f'''SELECT BY_NAME, revenue, cost
FROM sales
BY outlet
START '{start}'
END '{next_day}'
UNCONSOLIDATED'''
                return await self.run_report(access_token, adjacent)

    async def fetch_sales_graphql(
        self,
        access_token: str,
        start: str,
        end: str,
        timezone_name: str = "Australia/Adelaide",
        progress_callback: Any | None = None,
        outlet_ids: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """Fetch complete sales; Reporting API rows do not include stable Sale IDs."""
        outlet_clause = ", outlets: $outlets" if outlet_ids else ""
        outlet_variable = ", $outlets: [ID]" if outlet_ids else ""
        query = """
        query GetSales($startDate: DateTime, $endDate: DateTime, $after: Cursor%s) {
          sales(startDate: $startDate, endDate: $endDate, after: $after%s) {
            edges { node {
              id clientId status invoiceId totalCost totalDiscount totalTax totalPrice totalRounding createdAt updatedAt customer { id clientId name }
              linkedSale { id }
              register { id outlet { id name } }
              items { id quantity caseQuantity cost basePrice tax totalPrice metaData item { id ... on Product { name barcodes { code quantity } } } }
              payments { id amount status subtype }
            } }
            pageInfo { hasNextPage endCursor }
          }
        }
        """ % (outlet_variable, outlet_clause)
        try:
            local_zone = ZoneInfo(timezone_name)
        except (KeyError, ValueError):
            local_zone = timezone.utc
        local_start = datetime.combine(date.fromisoformat(start), time.min, tzinfo=local_zone)
        local_end = datetime.combine(date.fromisoformat(end) + timedelta(days=1), time.min, tzinfo=local_zone) - timedelta(microseconds=1)
        start_value = local_start.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        end_value = local_end.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        variables = {"startDate": start_value, "endDate": end_value}
        if outlet_ids:
            variables["outlets"] = outlet_ids
        try:
            return await self._fetch_connection_nodes(access_token, query, "sales", variables, progress_callback)
        except ShopfrontError:
            # Optional Product fields differ between Shopfront tenants. Keep
            # core Sale, item name, barcode, and payment sync available.
            basic_query = """
            query GetSales($startDate: DateTime, $endDate: DateTime, $after: Cursor%s) {
              sales(startDate: $startDate, endDate: $endDate, after: $after%s) {
                edges { node {
                  id clientId status invoiceId totalCost totalDiscount totalTax totalPrice createdAt updatedAt customer { id clientId name }
                  register { id outlet { id name } }
                  items { id quantity cost basePrice tax totalPrice item { id ... on Product { name description image alternateImages barcodes { code quantity } } } }
                  payments { id amount status subtype }
                } }
                pageInfo { hasNextPage endCursor }
              }
            }
            """ % (outlet_variable, outlet_clause)
            return await self._fetch_connection_nodes(access_token, basic_query, "sales", variables, progress_callback)

    async def fetch_outlets(self, access_token: str) -> list[dict[str, Any]]:
        data = await self.graphql(access_token, "{ outlets { id name deleted } }")
        rows = data.get("outlets", data)
        return rows if isinstance(rows, list) else []

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

    async def fetch_products_incremental(self, access_token: str, updated_after: str) -> list[dict[str, Any]]:
        """Fetch products changed since the last fully acknowledged catalog sync."""
        base = CATALOG_QUERY.replace(
            "query ShopfrontCatalog($after: Cursor)",
            "query ShopfrontCatalog($after: Cursor, $since: DateTime)",
        )
        queries = (
            base.replace(
                "products(first: 100, after: $after)",
                "products(first: 100, updatedAfter: $since, after: $after)",
            ),
            base.replace(
                "products(first: 100, after: $after)",
                "products(first: 100, lastStocktakedAfter: $since, after: $after)",
            ),
        )
        merged: dict[str, dict[str, Any]] = {}
        for query in queries:
            nodes = await self._fetch_connection_nodes(
                access_token,
                query,
                "products",
                variables={"since": updated_after},
            )
            for node in nodes:
                if not isinstance(node, dict) or not node.get("id"):
                    continue
                merged.setdefault(str(node["id"]), {}).update(node)
        return list(merged.values())

    async def _fetch_connection_nodes(
        self,
        access_token: str,
        query: str,
        field: str,
        variables: dict[str, Any] | None = None,
        progress_callback: Any | None = None,
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
            if progress_callback is not None:
                await progress_callback(field, len(result))
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

    async def fetch_suppliers(self, access_token: str) -> list[dict[str, Any]]:
        return await self._fetch_connection_nodes(access_token, SUPPLIERS_QUERY, "suppliers")

    async def fetch_purchase_orders(self, access_token: str) -> list[dict[str, Any]]:
        return await self._fetch_connection_nodes(access_token, PURCHASE_ORDERS_QUERY, "orders")

    async def fetch_customers(self, access_token: str) -> list[dict[str, Any]]:
        return await self._fetch_connection_nodes(access_token, CUSTOMERS_QUERY, "customers")

    async def fetch_customer_groups(self, access_token: str) -> list[dict[str, Any]]:
        data = await self.graphql(access_token, CUSTOMER_GROUPS_QUERY)
        rows = data.get("customerGroups", [])
        return rows if isinstance(rows, list) else []

    async def fetch_price_lists(self, access_token: str) -> list[dict[str, Any]]:
        data = await self.graphql(access_token, PRICE_LISTS_QUERY)
        rows = data.get("priceLists", [])
        return rows if isinstance(rows, list) else []

    async def fetch_classifications(self, access_token: str) -> dict[str, list[dict[str, Any]]]:
        result = {}
        for entity, query in CLASSIFICATION_QUERIES.items():
            result[entity] = await self._fetch_connection_nodes(access_token, query, entity)
        return result

    async def fetch_customer_payments(self, access_token: str) -> list[dict[str, Any]]:
        return await self._fetch_connection_nodes(access_token, CUSTOMER_PAYMENTS_QUERY, "customerPayments")

    async def fetch_saved_reports(self, access_token: str) -> list[dict[str, Any]]:
        data = await self.graphql(access_token, SAVED_REPORTS_QUERY)
        rows = data.get("reports", [])
        return rows if isinstance(rows, list) else []

    async def fetch_extended_data(self, access_token: str) -> tuple[dict[str, list[dict[str, Any]]], dict[str, str]]:
        entities: dict[str, list[dict[str, Any]]] = {}
        errors: dict[str, str] = {}
        paginated = {**CLASSIFICATION_QUERIES, **EXTENDED_CONNECTION_QUERIES}
        for entity, query in paginated.items():
            try:
                root = EXTENDED_CONNECTION_ROOTS.get(entity, entity)
                entities[entity] = await self._fetch_connection_nodes(access_token, query, root)
            except Exception as exc:
                errors[entity] = str(exc)[:500]
        for entity, query in EXTENDED_LIST_QUERIES.items():
            root = {
                "customer_groups": "customerGroups",
                "price_lists": "priceLists",
                "saved_reports": "reports",
            }.get(entity, entity)
            try:
                data = await self.graphql(access_token, query)
                rows = data.get(root, [])
                if not isinstance(rows, list):
                    raise ShopfrontError(f"Shopfront {root} query did not return a list")
                entities[entity] = [row for row in rows if isinstance(row, dict)]
            except Exception as exc:
                errors[entity] = str(exc)[:500]
        try:
            entities["customer_payments"] = await self.fetch_customer_payments(access_token)
        except Exception as exc:
            errors["customer_payments"] = str(exc)[:500]
        return entities, errors

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
