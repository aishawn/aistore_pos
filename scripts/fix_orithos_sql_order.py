#!/usr/bin/env python3
"""Fix orithos.sql import order: drop all tables first, create role before app_user."""

from pathlib import Path

SQL_PATH = Path(__file__).resolve().parent.parent / "pos-api" / "main/resources/db/orithos.sql"
# fix path
SQL_PATH = Path(__file__).resolve().parent.parent / "pos-api" / "src" / "main" / "resources" / "db" / "orithos.sql"

DROP_ALL = """
-- Drop all tables first so leftover char(32) schemas cannot break FK definitions.
DROP TABLE IF EXISTS `sale_payment`;
DROP TABLE IF EXISTS `sale_item`;
DROP TABLE IF EXISTS `sale_keys`;
DROP TABLE IF EXISTS `sale`;
DROP TABLE IF EXISTS `register_closure_payment`;
DROP TABLE IF EXISTS `register_closure`;
DROP TABLE IF EXISTS `register_payment_method`;
DROP TABLE IF EXISTS `register`;
DROP TABLE IF EXISTS `role_permission`;
DROP TABLE IF EXISTS `app_user`;
DROP TABLE IF EXISTS `role`;
DROP TABLE IF EXISTS `permission`;
DROP TABLE IF EXISTS `customer_payment_allocation`;
DROP TABLE IF EXISTS `customer_payment`;
DROP TABLE IF EXISTS `customer`;
DROP TABLE IF EXISTS `customer_group`;
DROP TABLE IF EXISTS `customer_display`;
DROP TABLE IF EXISTS `order_product`;
DROP TABLE IF EXISTS `order_related`;
DROP TABLE IF EXISTS `order_review`;
DROP TABLE IF EXISTS `purchase_order`;
DROP TABLE IF EXISTS `product_tag`;
DROP TABLE IF EXISTS `product_supplier`;
DROP TABLE IF EXISTS `product_price`;
DROP TABLE IF EXISTS `product_inventory`;
DROP TABLE IF EXISTS `product_cost`;
DROP TABLE IF EXISTS `product_competition_price`;
DROP TABLE IF EXISTS `product_barcode`;
DROP TABLE IF EXISTS `product_backorder`;
DROP TABLE IF EXISTS `product`;
DROP TABLE IF EXISTS `promotion_criteria`;
DROP TABLE IF EXISTS `promotion_customer_group`;
DROP TABLE IF EXISTS `promotion_outlet`;
DROP TABLE IF EXISTS `promotion`;
DROP TABLE IF EXISTS `promotion_category`;
DROP TABLE IF EXISTS `price_list_item`;
DROP TABLE IF EXISTS `price_list`;
DROP TABLE IF EXISTS `stocktake_product`;
DROP TABLE IF EXISTS `stocktake`;
DROP TABLE IF EXISTS `gift_card_movement`;
DROP TABLE IF EXISTS `gift_card`;
DROP TABLE IF EXISTS `host_identifier`;
DROP TABLE IF EXISTS `host_change`;
DROP TABLE IF EXISTS `host_connection`;
DROP TABLE IF EXISTS `future_cost`;
DROP TABLE IF EXISTS `future_price`;
DROP TABLE IF EXISTS `buying_period`;
DROP TABLE IF EXISTS `vendor_connection`;
DROP TABLE IF EXISTS `webhook`;
DROP TABLE IF EXISTS `integration`;
DROP TABLE IF EXISTS `user_reporting_outlet`;
DROP TABLE IF EXISTS `trashed_item`;
DROP TABLE IF EXISTS `transferee`;
DROP TABLE IF EXISTS `ticket_template_page`;
DROP TABLE IF EXISTS `ticket_template`;
DROP TABLE IF EXISTS `shelf_ticket`;
DROP TABLE IF EXISTS `security_event`;
DROP TABLE IF EXISTS `report`;
DROP TABLE IF EXISTS `quick_menu_item`;
DROP TABLE IF EXISTS `push_device`;
DROP TABLE IF EXISTS `notification`;
DROP TABLE IF EXISTS `mail_log`;
DROP TABLE IF EXISTS `kitchen_screen`;
DROP TABLE IF EXISTS `external_stocktake`;
DROP TABLE IF EXISTS `settings`;
DROP TABLE IF EXISTS `statement`;
DROP TABLE IF EXISTS `receipt`;
DROP TABLE IF EXISTS `barcode_template`;
DROP TABLE IF EXISTS `supplier`;
DROP TABLE IF EXISTS `outlet`;
DROP TABLE IF EXISTS `contact`;
DROP TABLE IF EXISTS `payment_method`;
DROP TABLE IF EXISTS `tax_rate`;
DROP TABLE IF EXISTS `price_set`;
DROP TABLE IF EXISTS `tag`;
DROP TABLE IF EXISTS `family`;
DROP TABLE IF EXISTS `category`;
DROP TABLE IF EXISTS `brand`;
DROP TABLE IF EXISTS `vendor`;

"""

ROLE_BLOCK = """
-- ----------------------------
-- Table structure for permission
-- ----------------------------
DROP TABLE IF EXISTS `permission`;
CREATE TABLE `permission`  (
  `id` int NOT NULL,
  `name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `safe_name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `section` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of permission
-- ----------------------------

-- ----------------------------
-- Table structure for role
-- ----------------------------
DROP TABLE IF EXISTS `role`;
CREATE TABLE `role`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `managed_id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT 'ManagedRoleIdTypeEnum',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of role
-- ----------------------------

-- ----------------------------
-- Table structure for role_permission
-- ----------------------------
DROP TABLE IF EXISTS `role_permission`;
CREATE TABLE `role_permission`  (
  `role_id` bigint NOT NULL,
  `permission_id` int NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`) USING BTREE,
  INDEX `fk_rp_perm`(`permission_id` ASC) USING BTREE,
  CONSTRAINT `fk_rp_perm` FOREIGN KEY (`permission_id`) REFERENCES `permission` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_rp_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of role_permission
-- ----------------------------

"""


def remove_table_block(text: str, table: str) -> str:
    """Remove DROP..CREATE..INSERT block for a table (up to next table header)."""
    import re
    pattern = (
        rf"-- -+\n-- Table structure for {table}\n-- -+\n"
        rf"DROP TABLE IF EXISTS `{table}`;.*?"
        rf"(?=\n-- -+\n-- Table structure for |\nSET FOREIGN_KEY_CHECKS = 1)"
    )
    return re.sub(pattern, "", text, count=1, flags=re.DOTALL)


def main():
    text = SQL_PATH.read_text(encoding="utf-8")

    if "Drop all tables first" not in text:
        text = text.replace(
            "SET FOREIGN_KEY_CHECKS = 0;\n",
            "SET FOREIGN_KEY_CHECKS = 0;\n" + DROP_ALL,
            1,
        )

    if "-- Table structure for permission\n" in text:
        marker = "-- ----------------------------\n-- Table structure for app_user"
        if marker in text and "Table structure for permission" not in text[: text.index(marker)]:
            text = text.replace(marker, ROLE_BLOCK + marker, 1)
            text = remove_table_block(text, "permission")
            text = remove_table_block(text, "role")
            text = remove_table_block(text, "role_permission")

    SQL_PATH.write_text(text, encoding="utf-8")
    print(f"Fixed: {SQL_PATH}")


if __name__ == "__main__":
    main()
