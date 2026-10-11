#!/usr/bin/env python3
"""Migrate char(32) entity ids to bigint in SQL files and Java source."""

import re
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JAVA_DIR = ROOT / "pos-api" / "src" / "main" / "java"
RESOURCES_DB = ROOT / "pos-api" / "src" / "main" / "resources" / "db"
MAPPER_XML = ROOT / "pos-api" / "src" / "main" / "resources" / "mapper"

# --- SQL helpers ---

def transform_sql_schema(text: str) -> str:
    """Convert char(32) id / *_id columns to bigint in CREATE TABLE blocks."""
    # Navicat export style: `id` char(32) CHARACTER SET ...
    text = re.sub(
        r"`(\w*id)`\s+char\(32\)\s+CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci\s+NOT NULL",
        r"`\1` bigint NOT NULL",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"`(\w*id)`\s+char\(32\)\s+CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci\s+NULL DEFAULT NULL",
        r"`\1` bigint NULL DEFAULT NULL",
        text,
        flags=re.IGNORECASE,
    )
    # schema.sql style: id CHAR(32) NOT NULL
    text = re.sub(
        r"\b(\w*id)\s+CHAR\(32\)\s+NOT NULL",
        r"\1 BIGINT NOT NULL",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"\b(\w*id)\s+CHAR\(32\)\s+NULL",
        r"\1 BIGINT NULL",
        text,
        flags=re.IGNORECASE,
    )
    # Add AUTO_INCREMENT to primary key `id` columns (not composite FK ids)
    text = re.sub(
        r"`id`\s+bigint\s+NOT NULL(?!\s+AUTO_INCREMENT)",
        "`id` bigint NOT NULL AUTO_INCREMENT",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"\bid\s+BIGINT\s+NOT NULL(?!\s+AUTO_INCREMENT)(?=\s*,|\s*\n)",
        "id BIGINT NOT NULL AUTO_INCREMENT",
        text,
        flags=re.IGNORECASE,
    )
    # settings.id already BIGINT AUTO_INCREMENT — undo double AUTO_INCREMENT if any
    text = re.sub(
        r"(CREATE TABLE settings[^;]*?id\s+BIGINT\s+NOT NULL)\s+AUTO_INCREMENT\s+AUTO_INCREMENT",
        r"\1 AUTO_INCREMENT",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    return text


def remap_sql_inserts(text: str) -> str:
    """Replace legacy char(32)/synthetic id strings in INSERT with sequential bigints."""
    id_map: dict[str, int] = {}
    counter = 1

    def map_id(raw: str) -> str:
        nonlocal counter
        if raw not in id_map:
            id_map[raw] = counter
            counter += 1
        return str(id_map[raw])

    def looks_like_legacy_id(val: str) -> bool:
        if not re.fullmatch(r"[0-9a-zA-Z]+", val):
            return False
        if len(val) == 32:
            return True
        # Navicat/demo ids: promo..., carlton..., padded zeros, etc.
        if len(val) >= 20 and ("000000" in val or val.startswith(("promo", "carlton"))):
            return True
        return False

    lines = []
    for line in text.splitlines():
        if line.strip().upper().startswith("INSERT"):
            def repl(m: re.Match) -> str:
                val = m.group(1)
                return map_id(val) if looks_like_legacy_id(val) else m.group(0)

            line = re.sub(r"'([0-9a-zA-Z]+)'", repl, line)
        lines.append(line)
    return "\n".join(lines) + ("\n" if text.endswith("\n") else "")


def process_sql_file(path: Path):
    content = path.read_text(encoding="utf-8")
    content = transform_sql_schema(content)
    if path.name == "orithos.sql":
        content = remap_sql_inserts(content)
    path.write_text(content, encoding="utf-8")
    print(f"Updated SQL: {path}")


# --- Java helpers ---

JAVA_REPLACEMENTS = [
    (r"private String id;", "private Long id;"),
    (r"private String (\w+Id);", r"private Long \1;"),
    (r"@PathVariable String id\b", "@PathVariable Long id"),
    (r"@RequestParam String id\b", "@RequestParam Long id"),
    (r"@RequestParam\(required = false\) String (\w+Id)\b", r"@RequestParam(required = false) Long \1"),
    (r"@RequestParam String (\w+Id)\b", r"@RequestParam Long \1"),
    (r"List<String> ids\b", "List<Long> ids"),
    (r"List<String> sourceIds\b", "List<Long> sourceIds"),
    (r"List<String> (\w+Ids)\b", r"List<Long> \1"),
    (r"String\[\] ids\b", "Long[] ids"),
    (r"String userId\b", "Long userId"),
    (r"String roleId\b", "Long roleId"),
    (r"String productId\b", "Long productId"),
    (r"String customerId\b", "Long customerId"),
    (r"String outletId\b", "Long outletId"),
    (r"String registerId\b", "Long registerId"),
    (r"String saleId\b", "Long saleId"),
    (r"String orderId\b", "Long orderId"),
    (r"String supplierId\b", "Long supplierId"),
    (r"String tagId\b", "Long tagId"),
    (r"String categoryId\b", "Long categoryId"),
    (r"String brandId\b", "Long brandId"),
    (r"String familyId\b", "Long familyId"),
    (r"String taxRateId\b", "Long taxRateId"),
    (r"String paymentMethodId\b", "Long paymentMethodId"),
    (r"String priceListId\b", "Long priceListId"),
    (r"String promotionId\b", "Long promotionId"),
    (r"String targetId\b", "Long targetId"),
    (r"String sourceId\b", "Long sourceId"),
    (r"String scopeId\b", "Long scopeId"),
    (r"String itemId\b", "Long itemId"),
    (r"String contactId\b", "Long contactId"),
    (r"String vendorId\b", "Long vendorId"),
    (r"String hostId\b", "Long hostId"),
    (r"String webhookId\b", "Long webhookId"),
    (r"String permissionId\b", "Long permissionId"),
    (r"String stocktakeId\b", "Long stocktakeId"),
    (r"String giftCardId\b", "Long giftCardId"),
    (r"String receiptId\b", "Long receiptId"),
    (r"String statementId\b", "Long statementId"),
    (r"String transfereeId\b", "Long transfereeId"),
    (r"String integrationId\b", "Long integrationId"),
    (r"String displayId\b", "Long displayId"),
    (r"String kitchenScreenId\b", "Long kitchenScreenId"),
    (r"String priceSetId\b", "Long priceSetId"),
    (r"String customerGroupId\b", "Long customerGroupId"),
    (r"String billingContactId\b", "Long billingContactId"),
    (r"String deliveryContactId\b", "Long deliveryContactId"),
    (r"String costTaxRateId\b", "Long costTaxRateId"),
    (r"String defaultTaxRateId\b", "Long defaultTaxRateId"),
    (r"String defaultReceiptId\b", "Long defaultReceiptId"),
    (r"String emailReceiptId\b", "Long emailReceiptId"),
    (r"String paymentReceiptId\b", "Long paymentReceiptId"),
    (r"String statementTemplateId\b", "Long statementTemplateId"),
    (r"String ticketingPriceSetId\b", "Long ticketingPriceSetId"),
    (r"String parentId\b", "Long parentId"),
    (r"String templateId\b", "Long templateId"),
    (r"String pageId\b", "Long pageId"),
    (r"String ticketTemplateId\b", "Long ticketTemplateId"),
    (r"String createdById\b", "Long createdById"),
    (r"String updatedById\b", "Long updatedById"),
    (r"String closedById\b", "Long closedById"),
    (r"String openedById\b", "Long openedById"),
    (r"String voidedById\b", "Long voidedById"),
    (r"String parkedById\b", "Long parkedById"),
    (r"String reviewedById\b", "Long reviewedById"),
    (r"String assignedUserId\b", "Long assignedUserId"),
    (r"String resourceId\b", "Long resourceId"),
    (r"String lockOwnerId\b", "Long lockOwnerId"),
    (r"String relatedId\b", "Long relatedId"),
    (r"String entityId\b", "Long entityId"),
    (r"String recordId\b", "Long recordId"),
    (r"String allocationId\b", "Long allocationId"),
    (r"String backorderId\b", "Long backorderId"),
    (r"String buyingPeriodId\b", "Long buyingPeriodId"),
    (r"String competitionPriceId\b", "Long competitionPriceId"),
    (r"String futureCostId\b", "Long futureCostId"),
    (r"String futurePriceId\b", "Long futurePriceId"),
    (r"String vendorConnectionId\b", "Long vendorConnectionId"),
    (r"String pushDeviceId\b", "Long pushDeviceId"),
    (r"String saleKeysId\b", "Long saleKeysId"),
    (r"String closureId\b", "Long closureId"),
    (r"String barcodeId\b", "Long barcodeId"),
    (r"String reviewId\b", "Long reviewId"),
    (r"String reportId\b", "Long reportId"),
    (r"String notificationId\b", "Long notificationId"),
    (r"String securityEventId\b", "Long securityEventId"),
    (r"String hostConnectionId\b", "Long hostConnectionId"),
    (r"String hostChangeId\b", "Long hostChangeId"),
    (r"String hostIdentifierId\b", "Long hostIdentifierId"),
    (r"String externalStocktakeId\b", "Long externalStocktakeId"),
    (r"String quickMenuItemId\b", "Long quickMenuItemId"),
    (r"String shelfTicketId\b", "Long shelfTicketId"),
    (r"String movementId\b", "Long movementId"),
    (r"String trashedItemId\b", "Long trashedItemId"),
    (r"String promotionCategoryId\b", "Long promotionCategoryId"),
    (r"String criteriaId\b", "Long criteriaId"),
    (r"String priceListItemId\b", "Long priceListItemId"),
    (r"String saleItemId\b", "Long saleItemId"),
    (r"String salePaymentId\b", "Long salePaymentId"),
    (r"String orderProductId\b", "Long orderProductId"),
    (r"String stocktakeProductId\b", "Long stocktakeProductId"),
    (r"String closurePaymentId\b", "Long closurePaymentId"),
    (r"String giftCardMovementId\b", "Long giftCardMovementId"),
    (r"String customerPaymentId\b", "Long customerPaymentId"),
    (r"String customerPaymentAllocationId\b", "Long customerPaymentAllocationId"),
    (r"String productBackorderId\b", "Long productBackorderId"),
    (r"String barcodeTemplateId\b", "Long barcodeTemplateId"),
    (r"String settingId\b", "Long settingId"),
    (r"String mailLogId\b", "Long mailLogId"),
    (r"String futureCostProductId\b", "Long futureCostProductId"),
    (r"String futurePriceProductId\b", "Long futurePriceProductId"),
    # Mapper method params
    (r"@Param\(\"id\"\) String id\b", '@Param("id") Long id'),
    (r"@Param\(\"(\w+Id)\"\) String \1\b", r'@Param("\1") Long \1'),
    (r"findById\(String id\)", "findById(Long id)"),
    (r"softDelete\(String id\)", "softDelete(Long id)"),
    (r"delete\(String id\)", "delete(Long id)"),
    (r"update\(String id\)", "update(Long id)"),
    (r"markVoid\(String id\)", "markVoid(Long id)"),
    (r"unpark\(String id\)", "unpark(Long id)"),
    (r"voidParked\(String id\)", "voidParked(Long id)"),
    (r"bulkSoftDelete\(@Param\(\"ids\"\) List<String> ids\)", 'bulkSoftDelete(@Param("ids") List<Long> ids)'),
    (r"reassignSaleItem\(@Param\(\"target\"\) String target, @Param\(\"source\"\) String source\)",
     'reassignSaleItem(@Param("target") Long target, @Param("source") Long source)'),
    (r"reassignOrderProduct\(@Param\(\"target\"\) String target, @Param\(\"source\"\) String source\)",
     'reassignOrderProduct(@Param("target") Long target, @Param("source") Long source)'),
    (r"reassignStocktakeProduct\(@Param\(\"target\"\) String target, @Param\(\"source\"\) String source\)",
     'reassignStocktakeProduct(@Param("target") Long target, @Param("source") Long source)'),
    (r"reassignBarcode\(@Param\(\"target\"\) String target, @Param\(\"source\"\) String source\)",
     'reassignBarcode(@Param("target") Long target, @Param("source") Long source)'),
    (r"reassignFuturePrice\(@Param\(\"target\"\) String target, @Param\(\"source\"\) String source\)",
     'reassignFuturePrice(@Param("target") Long target, @Param("source") Long source)'),
    (r"reassignFutureCost\(@Param\(\"target\"\) String target, @Param\(\"source\"\) String source\)",
     'reassignFutureCost(@Param("target") Long target, @Param("source") Long source)'),
    (r"reassignSaleCustomer\(@Param\(\"target\"\) String target, @Param\(\"source\"\) String source\)",
     'reassignSaleCustomer(@Param("target") Long target, @Param("source") Long source)'),
    (r"reassignPaymentCustomer\(@Param\(\"target\"\) String target, @Param\(\"source\"\) String source\)",
     'reassignPaymentCustomer(@Param("target") Long target, @Param("source") Long source)'),
    (r"reassignVendorConnectionCustomer\(@Param\(\"target\"\) String target, @Param\(\"source\"\) String source\)",
     'reassignVendorConnectionCustomer(@Param("target") Long target, @Param("source") Long source)'),
    (r"adjustInventory\(@Param\(\"productId\"\) String productId",
     'adjustInventory(@Param("productId") Long productId'),
    (r"insertBarcode\(@Param\(\"id\"\) String id",
     'insertBarcode(@Param("id") Long id'),
    (r"deleteBarcode\(@Param\(\"id\"\) String id", 'deleteBarcode(@Param("id") Long id'),
    (r"insertTag\(@Param\(\"productId\"\) String productId, @Param\(\"tagId\"\) String tagId",
     'insertTag(@Param("productId") Long productId, @Param("tagId") Long tagId'),
    (r"insertPrice\(@Param\(\"productId\"\) String productId",
     'insertPrice(@Param("productId") Long productId'),
    (r"softDelete\(@Param\(\"table\"\) String table, @Param\(\"id\"\) String id\)",
     'softDelete(@Param("table") String table, @Param("id") Long id)'),
    # Record types
    (r"record MergeRequest\(List<String> sourceIds\)", "record MergeRequest(List<Long> sourceIds)"),
    (r"record AssociateRequest\(List<String> (\w+Ids)\)", r"record AssociateRequest(List<Long> \1)"),
    (r"record BarcodeRequest\(String barcode", "record BarcodeRequest(String barcode"),  # keep barcode string
    # Jwt - subject stays string but convert at boundary
    (r"issueAccess\(String userId", "issueAccess(Long userId"),
    (r"issueRefresh\(String userId", "issueRefresh(Long userId"),
    (r"private IssuedToken issue\(String userId", "private IssuedToken issue(Long userId"),
    (r"\.subject\(userId\)", ".subject(String.valueOf(userId))"),
    # TokenStore / AuthUser
    (r"String getUserId\(\)", "Long getUserId()"),
    (r"void setUserId\(String", "void setUserId(Long"),
    (r"String userId\)", "Long userId)"),
    (r"String userId,", "Long userId,"),
    (r"final String userId", "final Long userId"),
    (r"private final String userId", "private final Long userId"),
    (r"private String userId;", "private Long userId;"),
    # CurrentUser
    (r"public static String currentUserId\(\)", "public static Long currentUserId()"),
    # ProductQuery empty string checks in XML handled separately
]

# Files/patterns to skip certain replacements
SKIP_FILES = set()


def process_java_file(path: Path):
    content = path.read_text(encoding="utf-8")
    original = content
    for pattern, repl in JAVA_REPLACEMENTS:
        content = re.sub(pattern, repl, content)
    if content != original:
        path.write_text(content, encoding="utf-8")
        print(f"Updated Java: {path.relative_to(ROOT)}")


def process_xml_file(path: Path):
    content = path.read_text(encoding="utf-8")
    original = content
    # Remove empty-string checks for Long id filters
    content = re.sub(
        r"(\w+Id)\s*!=\s*null\s+and\s+\1\s*!=\s*''",
        r"\1 != null",
        content,
    )
    if content != original:
        path.write_text(content, encoding="utf-8")
        print(f"Updated XML: {path.relative_to(ROOT)}")


def update_seed_sql(path: Path):
    content = path.read_text(encoding="utf-8")
    content = content.replace("REPLACE(UUID(),'-','')", "NULL")
    content = re.sub(
        r"INSERT INTO (\w+) \(id,",
        r"INSERT INTO \1 (",
        content,
    )
    # Remove id from VALUES first position when it was NULL
    # Simpler: rewrite seed.sql manually
    new_seed = """-- Optional sample data for the Orithos backend.
-- Run AFTER db/schema.sql. The admin user is auto-seeded by DataInitializer
-- (admin / 123456); this adds a little reference + demo data to browse.

-- Tax rates
INSERT INTO tax_rate (name, amount, is_default) VALUES
  ('GST', 10.0000, 1),
  ('GST Free', 0.0000, 0);

-- Payment methods
INSERT INTO payment_method (name, type) VALUES
  ('Cash', 'CASH'),
  ('EFTPOS', 'EFTPOS'),
  ('Gift Card', 'GIFT_CARD');

-- Classifications
INSERT INTO brand (name) VALUES
  ('Absolut'),
  ('Bacardi');
INSERT INTO category (name) VALUES
  ('Vodka'),
  ('Rum'),
  ('Beer Local');
INSERT INTO family (name) VALUES
  ('Spirits'),
  ('Beer'),
  ('Wine');
INSERT INTO tag (name) VALUES
  ('New Arrival'),
  ('On Sale'),
  ('Featured'),
  ('Clearance');

-- Suppliers
INSERT INTO supplier (name, status) VALUES
  ('Lion Nathan', 'ACTIVE'),
  ('CUB', 'ACTIVE'),
  ('Diageo', 'ACTIVE');

-- An outlet + register so sales/closures have a home
INSERT INTO outlet (name) VALUES ('Main Outlet');
SET @outlet_id = LAST_INSERT_ID();
INSERT INTO register (name, outlet_id) VALUES
  ('Register #1', @outlet_id);

-- A couple of products + the Sell-pad quick key
INSERT INTO product (name, type, status, cost, case_quantity)
VALUES ('Absolut Vodka 1l', 'STANDARD', 'ACTIVE', 64.75, 1),
       ('Bacardi Carta Blanca 700ml', 'STANDARD', 'ACTIVE', 48.59, 1),
       ('Carlton Draught Btl 375ml', 'STANDARD', 'ACTIVE', 2.80, 24);

SET @carlton_id = LAST_INSERT_ID();
INSERT INTO product_price (product_id, quantity, price)
VALUES (@carlton_id, 1, 4.50);

-- A customer group + customer
INSERT INTO customer_group (name) VALUES
  ('Loyalty Customers');
SET @group_id = LAST_INSERT_ID();
INSERT INTO customer (name, customer_group_id, current_owing)
VALUES ('Aliyah Roberts', @group_id, 0);
"""
    path.write_text(new_seed, encoding="utf-8")
    print(f"Rewrote seed: {path}")


def main():
    for sql_name in ["orithos.sql", "schema.sql"]:
        p = RESOURCES_DB / sql_name
        if p.exists():
            process_sql_file(p)

    update_seed_sql(RESOURCES_DB / "seed.sql")

    for java_file in JAVA_DIR.rglob("*.java"):
        process_java_file(java_file)

    for xml_file in MAPPER_XML.rglob("*.xml"):
        process_xml_file(xml_file)

    print("Done.")


if __name__ == "__main__":
    main()
