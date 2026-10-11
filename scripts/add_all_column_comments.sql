-- Orithos 全库字段中文注释
-- 由 scripts/generate_column_comments.py 自动生成
SET NAMES utf8mb4;

-- app_user（应用用户）
ALTER TABLE `app_user` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `app_user` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '显示名称';
ALTER TABLE `app_user` MODIFY COLUMN `username` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '登录用户名';
ALTER TABLE `app_user` MODIFY COLUMN `password_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '密码哈希（BCrypt，禁止明文存储）';
ALTER TABLE `app_user` MODIFY COLUMN `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '电子邮箱';
ALTER TABLE `app_user` MODIFY COLUMN `phone` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '电话';
ALTER TABLE `app_user` MODIFY COLUMN `image` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '头像/图片 URL';
ALTER TABLE `app_user` MODIFY COLUMN `role_id` bigint NULL DEFAULT NULL COMMENT '角色 ID';
ALTER TABLE `app_user` MODIFY COLUMN `is_admin` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否管理员';
ALTER TABLE `app_user` MODIFY COLUMN `is_api_user` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否 API 用户';
ALTER TABLE `app_user` MODIFY COLUMN `dark_mode` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'default' COMMENT '深色模式';
ALTER TABLE `app_user` MODIFY COLUMN `dashboard` json NULL COMMENT '仪表盘配置（JSON）';
ALTER TABLE `app_user` MODIFY COLUMN `pending_password_reset` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否待重置密码';
ALTER TABLE `app_user` MODIFY COLUMN `deleted_at` datetime NULL DEFAULT NULL COMMENT '删除时间（软删除）';
ALTER TABLE `app_user` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

-- barcode_template（条码模板）
ALTER TABLE `barcode_template` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `barcode_template` MODIFY COLUMN `name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `barcode_template` MODIFY COLUMN `template` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '模板内容';
ALTER TABLE `barcode_template` MODIFY COLUMN `recalculate_quantity` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否重算数量';

-- brand（品牌）
ALTER TABLE `brand` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `brand` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `brand` MODIFY COLUMN `mdb_id` int NULL DEFAULT NULL COMMENT 'MDB 外部系统 ID';
ALTER TABLE `brand` MODIFY COLUMN `deleted_at` datetime NULL DEFAULT NULL COMMENT '删除时间（软删除）';

-- buying_period（采购周期）
ALTER TABLE `buying_period` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `buying_period` MODIFY COLUMN `item_id` bigint NULL DEFAULT NULL COMMENT '关联条目 ID';
ALTER TABLE `buying_period` MODIFY COLUMN `item_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '条目类型';
ALTER TABLE `buying_period` MODIFY COLUMN `outlet_id` bigint NULL DEFAULT NULL COMMENT '门店 ID';
ALTER TABLE `buying_period` MODIFY COLUMN `supplier_id` bigint NULL DEFAULT NULL COMMENT '供应商 ID';
ALTER TABLE `buying_period` MODIFY COLUMN `start` datetime NULL DEFAULT NULL COMMENT '周期开始时间';
ALTER TABLE `buying_period` MODIFY COLUMN `end` datetime NULL DEFAULT NULL COMMENT '周期结束时间';
ALTER TABLE `buying_period` MODIFY COLUMN `quantity` decimal(14, 4) NULL DEFAULT NULL COMMENT '数量';
ALTER TABLE `buying_period` MODIFY COLUMN `cost` decimal(14, 4) NULL DEFAULT NULL COMMENT '成本';

-- capped_price（封顶价）
ALTER TABLE `capped_price` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `capped_price` MODIFY COLUMN `product_id` bigint NOT NULL COMMENT '商品 ID';
ALTER TABLE `capped_price` MODIFY COLUMN `source` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '来源名称';
ALTER TABLE `capped_price` MODIFY COLUMN `source_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '来源类型（PROVIDED/IMPORTED）';
ALTER TABLE `capped_price` MODIFY COLUMN `price_set_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '价格组名称';
ALTER TABLE `capped_price` MODIFY COLUMN `start_date` date NULL DEFAULT NULL COMMENT '生效开始日期';
ALTER TABLE `capped_price` MODIFY COLUMN `end_date` date NULL DEFAULT NULL COMMENT '生效结束日期';
ALTER TABLE `capped_price` MODIFY COLUMN `quantity` decimal(14, 4) NOT NULL DEFAULT 1.0000 COMMENT '数量';
ALTER TABLE `capped_price` MODIFY COLUMN `capped_price` decimal(14, 4) NOT NULL COMMENT '封顶价格';

-- category（分类）
ALTER TABLE `category` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `category` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `category` MODIFY COLUMN `mdb_id` int NULL DEFAULT NULL COMMENT 'MDB 外部系统 ID';
ALTER TABLE `category` MODIFY COLUMN `metcash_msc` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT 'Metcash MSC 编码';
ALTER TABLE `category` MODIFY COLUMN `deleted_at` datetime NULL DEFAULT NULL COMMENT '删除时间（软删除）';

-- contact（联系信息）
ALTER TABLE `contact` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `contact` MODIFY COLUMN `address_street1` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '地址行 1';
ALTER TABLE `contact` MODIFY COLUMN `address_street2` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '地址行 2';
ALTER TABLE `contact` MODIFY COLUMN `address_suburb` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '地址区/街道';
ALTER TABLE `contact` MODIFY COLUMN `address_city` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '城市';
ALTER TABLE `contact` MODIFY COLUMN `address_postcode` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '邮编';
ALTER TABLE `contact` MODIFY COLUMN `address_region` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '省/州';
ALTER TABLE `contact` MODIFY COLUMN `address_country` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '国家';
ALTER TABLE `contact` MODIFY COLUMN `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '电子邮箱';
ALTER TABLE `contact` MODIFY COLUMN `fax` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '传真';
ALTER TABLE `contact` MODIFY COLUMN `phone` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '电话';
ALTER TABLE `contact` MODIFY COLUMN `mobile` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '手机';
ALTER TABLE `contact` MODIFY COLUMN `website` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '网站';
ALTER TABLE `contact` MODIFY COLUMN `twitter` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT 'Twitter';
ALTER TABLE `contact` MODIFY COLUMN `facebook` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT 'Facebook';

-- customer（客户）
ALTER TABLE `customer` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `customer` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '名称';
ALTER TABLE `customer` MODIFY COLUMN `first_name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '名';
ALTER TABLE `customer` MODIFY COLUMN `last_name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '姓';
ALTER TABLE `customer` MODIFY COLUMN `code` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '编码';
ALTER TABLE `customer` MODIFY COLUMN `company` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '公司名称';
ALTER TABLE `customer` MODIFY COLUMN `business_number` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '商业登记号/税号';
ALTER TABLE `customer` MODIFY COLUMN `birthday` date NULL DEFAULT NULL COMMENT '生日';
ALTER TABLE `customer` MODIFY COLUMN `gender` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '性别';
ALTER TABLE `customer` MODIFY COLUMN `billing_contact_id` bigint NULL DEFAULT NULL COMMENT '账单地址 ID';
ALTER TABLE `customer` MODIFY COLUMN `delivery_contact_id` bigint NULL DEFAULT NULL COMMENT '配送地址 ID';
ALTER TABLE `customer` MODIFY COLUMN `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '电子邮箱';
ALTER TABLE `customer` MODIFY COLUMN `phone` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '电话';
ALTER TABLE `customer` MODIFY COLUMN `mobile` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '手机';
ALTER TABLE `customer` MODIFY COLUMN `fax` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '传真';
ALTER TABLE `customer` MODIFY COLUMN `allow_marketing_emails` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否允许营销邮件';
ALTER TABLE `customer` MODIFY COLUMN `invoice_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '发票附言';
ALTER TABLE `customer` MODIFY COLUMN `comments` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '备注';
ALTER TABLE `customer` MODIFY COLUMN `customer_group_id` bigint NULL DEFAULT NULL COMMENT '客户组 ID';
ALTER TABLE `customer` MODIFY COLUMN `override_customer_group` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否覆盖客户组设置';
ALTER TABLE `customer` MODIFY COLUMN `loyalty_enabled` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否启用积分';
ALTER TABLE `customer` MODIFY COLUMN `loyalty_rate` decimal(14, 4) NULL DEFAULT NULL COMMENT '积分比率';
ALTER TABLE `customer` MODIFY COLUMN `loyalty_points` decimal(14, 4) NOT NULL DEFAULT 0.0000 COMMENT '积分余额';
ALTER TABLE `customer` MODIFY COLUMN `disable_promotions` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否禁用促销';
ALTER TABLE `customer` MODIFY COLUMN `price_list_id` bigint NULL DEFAULT NULL COMMENT '价目表 ID';
ALTER TABLE `customer` MODIFY COLUMN `require_order_reference` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否必填订单参考号';
ALTER TABLE `customer` MODIFY COLUMN `account_limit` decimal(14, 2) NULL DEFAULT NULL COMMENT '账期额度';
ALTER TABLE `customer` MODIFY COLUMN `current_owing` decimal(14, 2) NOT NULL DEFAULT 0.00 COMMENT '当前欠款';
ALTER TABLE `customer` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';
ALTER TABLE `customer` MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';
ALTER TABLE `customer` MODIFY COLUMN `deleted_at` datetime NULL DEFAULT NULL COMMENT '删除时间（软删除）';

-- customer_display（客户显示屏）
ALTER TABLE `customer_display` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `customer_display` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '名称';
ALTER TABLE `customer_display` MODIFY COLUMN `main_colour` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '主色调';
ALTER TABLE `customer_display` MODIFY COLUMN `text_colour` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '文字颜色';
ALTER TABLE `customer_display` MODIFY COLUMN `idle` json NULL COMMENT '空闲屏配置（JSON）';
ALTER TABLE `customer_display` MODIFY COLUMN `sale` json NULL COMMENT '销售屏配置（JSON）';
ALTER TABLE `customer_display` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

-- customer_email（客户邮箱）
ALTER TABLE `customer_email` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `customer_email` MODIFY COLUMN `customer_id` bigint NOT NULL COMMENT '客户 ID';
ALTER TABLE `customer_email` MODIFY COLUMN `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '电子邮箱';
ALTER TABLE `customer_email` MODIFY COLUMN `sort_order` int NOT NULL DEFAULT 0 COMMENT '排序序号';

-- customer_group（客户组）
ALTER TABLE `customer_group` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `customer_group` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `customer_group` MODIFY COLUMN `default_receipt_id` bigint NULL DEFAULT NULL COMMENT '默认小票模板 ID';
ALTER TABLE `customer_group` MODIFY COLUMN `email_receipt_id` bigint NULL DEFAULT NULL COMMENT '邮件小票模板 ID';
ALTER TABLE `customer_group` MODIFY COLUMN `payment_receipt_id` bigint NULL DEFAULT NULL COMMENT '付款小票模板 ID';
ALTER TABLE `customer_group` MODIFY COLUMN `statement_template_id` bigint NULL DEFAULT NULL COMMENT '对账单模板 ID';
ALTER TABLE `customer_group` MODIFY COLUMN `price_list_id` bigint NULL DEFAULT NULL COMMENT '价目表 ID';
ALTER TABLE `customer_group` MODIFY COLUMN `loyalty_enabled` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否启用积分';
ALTER TABLE `customer_group` MODIFY COLUMN `loyalty_rate` decimal(14, 4) NULL DEFAULT NULL COMMENT '积分比率';
ALTER TABLE `customer_group` MODIFY COLUMN `disable_promotions` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否禁用促销';
ALTER TABLE `customer_group` MODIFY COLUMN `allow_account_sales` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否允许挂账';
ALTER TABLE `customer_group` MODIFY COLUMN `account_limit` decimal(14, 2) NULL DEFAULT NULL COMMENT '账期额度';
ALTER TABLE `customer_group` MODIFY COLUMN `auto_print_receipt` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否自动打印小票';
ALTER TABLE `customer_group` MODIFY COLUMN `auto_print_parked_receipt` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否自动打印挂单小票';
ALTER TABLE `customer_group` MODIFY COLUMN `auto_email_receipt` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否自动邮件小票';
ALTER TABLE `customer_group` MODIFY COLUMN `auto_print_payment_receipt` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否自动打印付款小票';
ALTER TABLE `customer_group` MODIFY COLUMN `require_order_reference` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否必填订单参考号';
ALTER TABLE `customer_group` MODIFY COLUMN `credit_terms` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '账期条款';
ALTER TABLE `customer_group` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';
ALTER TABLE `customer_group` MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';
ALTER TABLE `customer_group` MODIFY COLUMN `deleted_at` datetime NULL DEFAULT NULL COMMENT '删除时间（软删除）';

-- customer_payment（客户付款）
ALTER TABLE `customer_payment` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `customer_payment` MODIFY COLUMN `customer_id` bigint NOT NULL COMMENT '客户 ID';
ALTER TABLE `customer_payment` MODIFY COLUMN `payment_method_id` bigint NULL DEFAULT NULL COMMENT '支付方式 ID';
ALTER TABLE `customer_payment` MODIFY COLUMN `user_id` bigint NULL DEFAULT NULL COMMENT '用户 ID';
ALTER TABLE `customer_payment` MODIFY COLUMN `register_id` bigint NULL DEFAULT NULL COMMENT '收银机 ID';
ALTER TABLE `customer_payment` MODIFY COLUMN `reference` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '参考号/单号';
ALTER TABLE `customer_payment` MODIFY COLUMN `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '付款状态';
ALTER TABLE `customer_payment` MODIFY COLUMN `start_balance` decimal(14, 2) NULL DEFAULT NULL COMMENT '期初余额';
ALTER TABLE `customer_payment` MODIFY COLUMN `amount` decimal(14, 2) NOT NULL COMMENT '金额/数量';
ALTER TABLE `customer_payment` MODIFY COLUMN `rounding` decimal(14, 4) NULL DEFAULT NULL COMMENT '抹零/四舍五入';
ALTER TABLE `customer_payment` MODIFY COLUMN `timestamp` datetime NOT NULL COMMENT '时间戳';
ALTER TABLE `customer_payment` MODIFY COLUMN `relates_to_id` bigint NULL DEFAULT NULL COMMENT '关联记录 ID';
ALTER TABLE `customer_payment` MODIFY COLUMN `cancelled_at` datetime NULL DEFAULT NULL COMMENT '取消时间';

-- customer_payment_allocation（客户付款分配）
ALTER TABLE `customer_payment_allocation` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `customer_payment_allocation` MODIFY COLUMN `payment_id` bigint NOT NULL COMMENT '付款 ID';
ALTER TABLE `customer_payment_allocation` MODIFY COLUMN `sale_id` bigint NULL DEFAULT NULL COMMENT '销售单 ID';
ALTER TABLE `customer_payment_allocation` MODIFY COLUMN `amount` decimal(14, 2) NOT NULL COMMENT '分配金额';
ALTER TABLE `customer_payment_allocation` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

-- customer_revision（客户变更记录）
ALTER TABLE `customer_revision` MODIFY COLUMN `id` bigint NOT NULL COMMENT '变更记录 ID';
ALTER TABLE `customer_revision` MODIFY COLUMN `customer_id` bigint NOT NULL COMMENT '客户 ID';
ALTER TABLE `customer_revision` MODIFY COLUMN `user_id` bigint NULL DEFAULT NULL COMMENT '用户 ID';
ALTER TABLE `customer_revision` MODIFY COLUMN `action` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '变更操作';
ALTER TABLE `customer_revision` MODIFY COLUMN `field_name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '字段名';
ALTER TABLE `customer_revision` MODIFY COLUMN `old_value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '旧值';
ALTER TABLE `customer_revision` MODIFY COLUMN `new_value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '新值';
ALTER TABLE `customer_revision` MODIFY COLUMN `summary` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '变更摘要';
ALTER TABLE `customer_revision` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

-- external_stocktake（外部盘点）
ALTER TABLE `external_stocktake` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `external_stocktake` MODIFY COLUMN `outlet_id` bigint NULL DEFAULT NULL COMMENT '门店 ID';
ALTER TABLE `external_stocktake` MODIFY COLUMN `user_id` bigint NULL DEFAULT NULL COMMENT '用户 ID';
ALTER TABLE `external_stocktake` MODIFY COLUMN `completed_id` bigint NULL DEFAULT NULL COMMENT '完成记录 ID';
ALTER TABLE `external_stocktake` MODIFY COLUMN `zero_stock` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否零库存';
ALTER TABLE `external_stocktake` MODIFY COLUMN `override_stock` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否覆盖库存';
ALTER TABLE `external_stocktake` MODIFY COLUMN `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '外部盘点状态';
ALTER TABLE `external_stocktake` MODIFY COLUMN `timestamp` datetime NULL DEFAULT NULL COMMENT '时间戳';

-- family（产品系列）
ALTER TABLE `family` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `family` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `family` MODIFY COLUMN `mdb_id` int NULL DEFAULT NULL COMMENT 'MDB 外部系统 ID';
ALTER TABLE `family` MODIFY COLUMN `deleted_at` datetime NULL DEFAULT NULL COMMENT '删除时间（软删除）';

-- future_cost（未来成本）
ALTER TABLE `future_cost` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `future_cost` MODIFY COLUMN `product_id` bigint NULL DEFAULT NULL COMMENT '商品 ID';
ALTER TABLE `future_cost` MODIFY COLUMN `supplier_id` bigint NULL DEFAULT NULL COMMENT '供应商 ID';
ALTER TABLE `future_cost` MODIFY COLUMN `quantity` decimal(14, 4) NOT NULL DEFAULT 1.0000 COMMENT '数量';
ALTER TABLE `future_cost` MODIFY COLUMN `cost` decimal(14, 4) NOT NULL COMMENT '成本';
ALTER TABLE `future_cost` MODIFY COLUMN `cost_ex` decimal(14, 4) NULL DEFAULT NULL COMMENT '不含税成本';
ALTER TABLE `future_cost` MODIFY COLUMN `user_id` bigint NULL DEFAULT NULL COMMENT '用户 ID';
ALTER TABLE `future_cost` MODIFY COLUMN `effective_time` datetime NOT NULL COMMENT '生效时间';

-- future_price（未来价格）
ALTER TABLE `future_price` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `future_price` MODIFY COLUMN `product_id` bigint NULL DEFAULT NULL COMMENT '商品 ID';
ALTER TABLE `future_price` MODIFY COLUMN `price_set_id` bigint NULL DEFAULT NULL COMMENT '价格组 ID';
ALTER TABLE `future_price` MODIFY COLUMN `quantity` decimal(14, 4) NOT NULL DEFAULT 1.0000 COMMENT '数量';
ALTER TABLE `future_price` MODIFY COLUMN `price` decimal(14, 4) NOT NULL COMMENT '价格';
ALTER TABLE `future_price` MODIFY COLUMN `price_ex` decimal(14, 4) NULL DEFAULT NULL COMMENT '不含税价格';
ALTER TABLE `future_price` MODIFY COLUMN `user_id` bigint NULL DEFAULT NULL COMMENT '用户 ID';
ALTER TABLE `future_price` MODIFY COLUMN `effective_time` datetime NOT NULL COMMENT '生效时间';

-- gift_card（礼品卡）
ALTER TABLE `gift_card` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `gift_card` MODIFY COLUMN `client_id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '客户端 ID';
ALTER TABLE `gift_card` MODIFY COLUMN `outlet_id` bigint NULL DEFAULT NULL COMMENT '门店 ID';
ALTER TABLE `gift_card` MODIFY COLUMN `code` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '编码';
ALTER TABLE `gift_card` MODIFY COLUMN `original_amount` decimal(14, 2) NOT NULL COMMENT '原始金额';
ALTER TABLE `gift_card` MODIFY COLUMN `current_amount` decimal(14, 2) NOT NULL COMMENT '当前余额';
ALTER TABLE `gift_card` MODIFY COLUMN `expiry` datetime NULL DEFAULT NULL COMMENT '过期时间';
ALTER TABLE `gift_card` MODIFY COLUMN `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '礼品卡状态';

-- gift_card_movement（礼品卡流水）
ALTER TABLE `gift_card_movement` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `gift_card_movement` MODIFY COLUMN `gift_card_id` bigint NOT NULL COMMENT '礼品卡 ID';
ALTER TABLE `gift_card_movement` MODIFY COLUMN `sale_id` bigint NULL DEFAULT NULL COMMENT '销售单 ID';
ALTER TABLE `gift_card_movement` MODIFY COLUMN `register_id` bigint NULL DEFAULT NULL COMMENT '收银机 ID';
ALTER TABLE `gift_card_movement` MODIFY COLUMN `amount` decimal(14, 2) NOT NULL COMMENT '金额/数量';
ALTER TABLE `gift_card_movement` MODIFY COLUMN `action` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '流水类型（SOLD/REDEEMED）';
ALTER TABLE `gift_card_movement` MODIFY COLUMN `timestamp` datetime NOT NULL COMMENT '时间戳';

-- host_change（主机同步变更）
ALTER TABLE `host_change` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `host_change` MODIFY COLUMN `host_connection_id` bigint NULL DEFAULT NULL COMMENT '主机连接 ID';
ALTER TABLE `host_change` MODIFY COLUMN `type` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '变更类型';
ALTER TABLE `host_change` MODIFY COLUMN `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '变更状态';
ALTER TABLE `host_change` MODIFY COLUMN `data` json NULL COMMENT '数据（JSON）';
ALTER TABLE `host_change` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

-- host_connection（主机连接）
ALTER TABLE `host_connection` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `host_connection` MODIFY COLUMN `type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '主机连接类型';
ALTER TABLE `host_connection` MODIFY COLUMN `outlet_id` bigint NULL DEFAULT NULL COMMENT '门店 ID';
ALTER TABLE `host_connection` MODIFY COLUMN `price_set_id` bigint NULL DEFAULT NULL COMMENT '价格组 ID';
ALTER TABLE `host_connection` MODIFY COLUMN `user_id` bigint NULL DEFAULT NULL COMMENT '用户 ID';
ALTER TABLE `host_connection` MODIFY COLUMN `metadata` json NULL COMMENT '元数据（JSON）';
ALTER TABLE `host_connection` MODIFY COLUMN `settings` json NULL COMMENT '设置（JSON）';
ALTER TABLE `host_connection` MODIFY COLUMN `credentials` json NULL COMMENT '凭证（JSON）';
ALTER TABLE `host_connection` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

-- host_identifier（主机标识映射）
ALTER TABLE `host_identifier` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `host_identifier` MODIFY COLUMN `host_connection_id` bigint NULL DEFAULT NULL COMMENT '主机连接 ID';
ALTER TABLE `host_identifier` MODIFY COLUMN `local_id` bigint NULL DEFAULT NULL COMMENT '本地 ID';
ALTER TABLE `host_identifier` MODIFY COLUMN `host_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '主机端 ID';
ALTER TABLE `host_identifier` MODIFY COLUMN `type` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '标识类型';

-- integration（集成）
ALTER TABLE `integration` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `integration` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '名称';
ALTER TABLE `integration` MODIFY COLUMN `type` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '类型';
ALTER TABLE `integration` MODIFY COLUMN `enabled` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否启用';
ALTER TABLE `integration` MODIFY COLUMN `config` json NULL COMMENT '配置（JSON）';
ALTER TABLE `integration` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

-- kitchen_screen（厨房屏）
ALTER TABLE `kitchen_screen` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `kitchen_screen` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '名称';
ALTER TABLE `kitchen_screen` MODIFY COLUMN `rules` json NULL COMMENT '规则（JSON）';
ALTER TABLE `kitchen_screen` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

-- mail_log（邮件日志）
ALTER TABLE `mail_log` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `mail_log` MODIFY COLUMN `recipient` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '收件人';
ALTER TABLE `mail_log` MODIFY COLUMN `subject` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '主题';
ALTER TABLE `mail_log` MODIFY COLUMN `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '邮件状态（DELIVERED/BOUNCED/PENDING）';
ALTER TABLE `mail_log` MODIFY COLUMN `sent_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间';

-- notification（通知）
ALTER TABLE `notification` MODIFY COLUMN `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '通知 UUID';
ALTER TABLE `notification` MODIFY COLUMN `notifiable_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '通知对象类型';
ALTER TABLE `notification` MODIFY COLUMN `notifiable_id` bigint NULL DEFAULT NULL COMMENT '通知对象 ID';
ALTER TABLE `notification` MODIFY COLUMN `data` json NULL COMMENT '数据（JSON）';
ALTER TABLE `notification` MODIFY COLUMN `read_at` datetime NULL DEFAULT NULL COMMENT '已读时间';
ALTER TABLE `notification` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';
ALTER TABLE `notification` MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

-- order_product（订单商品行）
ALTER TABLE `order_product` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `order_product` MODIFY COLUMN `order_id` bigint NOT NULL COMMENT '订单 ID';
ALTER TABLE `order_product` MODIFY COLUMN `product_id` bigint NULL DEFAULT NULL COMMENT '商品 ID';
ALTER TABLE `order_product` MODIFY COLUMN `supplier_id` bigint NULL DEFAULT NULL COMMENT '供应商 ID';
ALTER TABLE `order_product` MODIFY COLUMN `supplier_code` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '供应商商品编码';
ALTER TABLE `order_product` MODIFY COLUMN `case_quantity` decimal(14, 4) NULL DEFAULT NULL COMMENT '箱规（每箱数量）';
ALTER TABLE `order_product` MODIFY COLUMN `ordered_quantity` decimal(14, 4) NULL DEFAULT NULL COMMENT '订购数量';
ALTER TABLE `order_product` MODIFY COLUMN `received_quantity` decimal(14, 4) NULL DEFAULT NULL COMMENT '收货数量';
ALTER TABLE `order_product` MODIFY COLUMN `base_cost` decimal(14, 4) NULL DEFAULT NULL COMMENT '基础成本';
ALTER TABLE `order_product` MODIFY COLUMN `ordered_cost` decimal(14, 4) NULL DEFAULT NULL COMMENT '订购成本';
ALTER TABLE `order_product` MODIFY COLUMN `fees` decimal(14, 4) NULL DEFAULT NULL COMMENT '费用';
ALTER TABLE `order_product` MODIFY COLUMN `freight` decimal(14, 4) NULL DEFAULT NULL COMMENT '运费';
ALTER TABLE `order_product` MODIFY COLUMN `rebate` decimal(14, 4) NULL DEFAULT NULL COMMENT '返利';

-- order_related（关联订单）
ALTER TABLE `order_related` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `order_related` MODIFY COLUMN `order_id` bigint NOT NULL COMMENT '订单 ID';
ALTER TABLE `order_related` MODIFY COLUMN `related_order_id` bigint NOT NULL COMMENT '关联订单 ID';

-- order_review（订单审核）
ALTER TABLE `order_review` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `order_review` MODIFY COLUMN `order_id` bigint NULL DEFAULT NULL COMMENT '订单 ID';
ALTER TABLE `order_review` MODIFY COLUMN `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '审核状态';
ALTER TABLE `order_review` MODIFY COLUMN `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '备注';
ALTER TABLE `order_review` MODIFY COLUMN `data` json NULL COMMENT '数据（JSON）';
ALTER TABLE `order_review` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

-- outlet（门店）
ALTER TABLE `outlet` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `outlet` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `outlet` MODIFY COLUMN `contact_id` bigint NULL DEFAULT NULL COMMENT '联系信息 ID';
ALTER TABLE `outlet` MODIFY COLUMN `logo` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '门店 Logo URL';
ALTER TABLE `outlet` MODIFY COLUMN `business_number` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '商业登记号/税号';
ALTER TABLE `outlet` MODIFY COLUMN `loyalty_enabled` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否启用积分';
ALTER TABLE `outlet` MODIFY COLUMN `loyalty_name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '积分计划名称';
ALTER TABLE `outlet` MODIFY COLUMN `loyalty_earn_rate` decimal(14, 4) NULL DEFAULT NULL COMMENT '积分获取比率';
ALTER TABLE `outlet` MODIFY COLUMN `loyalty_redeem_rate` decimal(14, 4) NULL DEFAULT NULL COMMENT '积分兑换比率';
ALTER TABLE `outlet` MODIFY COLUMN `has_kitchen_screen` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否有厨房屏';
ALTER TABLE `outlet` MODIFY COLUMN `ticketing_price_set_id` bigint NULL DEFAULT NULL COMMENT '价签价格组 ID';
ALTER TABLE `outlet` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';
ALTER TABLE `outlet` MODIFY COLUMN `deleted_at` datetime NULL DEFAULT NULL COMMENT '删除时间（软删除）';

-- payment_method（支付方式）
ALTER TABLE `payment_method` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `payment_method` MODIFY COLUMN `name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `payment_method` MODIFY COLUMN `type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '支付方式类型';
ALTER TABLE `payment_method` MODIFY COLUMN `surcharge` decimal(8, 4) NULL DEFAULT NULL COMMENT '附加费';
ALTER TABLE `payment_method` MODIFY COLUMN `always_open_drawer` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否总是开钱箱';
ALTER TABLE `payment_method` MODIFY COLUMN `always_print` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否总是打印';
ALTER TABLE `payment_method` MODIFY COLUMN `use_rounding` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否使用抹零';
ALTER TABLE `payment_method` MODIFY COLUMN `default_pay_exact` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否默认精确支付';
ALTER TABLE `payment_method` MODIFY COLUMN `cashout_method_id` bigint NULL DEFAULT NULL COMMENT '找零方式 ID';
ALTER TABLE `payment_method` MODIFY COLUMN `gateway_url` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '支付网关 URL';
ALTER TABLE `payment_method` MODIFY COLUMN `background_colour` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '背景色';
ALTER TABLE `payment_method` MODIFY COLUMN `text_colour` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '文字颜色';
ALTER TABLE `payment_method` MODIFY COLUMN `deleted_at` datetime NULL DEFAULT NULL COMMENT '删除时间（软删除）';

-- permission（权限）
ALTER TABLE `permission` MODIFY COLUMN `id` int NOT NULL COMMENT '主键';
ALTER TABLE `permission` MODIFY COLUMN `name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `permission` MODIFY COLUMN `safe_name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '安全名称';
ALTER TABLE `permission` MODIFY COLUMN `section` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '权限分组';

-- price_list（价目表）
ALTER TABLE `price_list` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `price_list` MODIFY COLUMN `name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `price_list` MODIFY COLUMN `allow_higher_price` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否允许高于原价';
ALTER TABLE `price_list` MODIFY COLUMN `allow_discounting_promotions` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否允许促销折扣';
ALTER TABLE `price_list` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';
ALTER TABLE `price_list` MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

-- price_list_item（价目表条目）
ALTER TABLE `price_list_item` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `price_list_item` MODIFY COLUMN `price_list_id` bigint NOT NULL COMMENT '价目表 ID';
ALTER TABLE `price_list_item` MODIFY COLUMN `classification_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '分类类型';
ALTER TABLE `price_list_item` MODIFY COLUMN `item_id` bigint NULL DEFAULT NULL COMMENT '商品/品牌/分类/系列/标签 ID';
ALTER TABLE `price_list_item` MODIFY COLUMN `exclude` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否排除';
ALTER TABLE `price_list_item` MODIFY COLUMN `rule` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '定价规则';
ALTER TABLE `price_list_item` MODIFY COLUMN `amount` decimal(14, 4) NULL DEFAULT NULL COMMENT '规则金额/百分比';

-- price_set（价格组）
ALTER TABLE `price_set` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `price_set` MODIFY COLUMN `name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `price_set` MODIFY COLUMN `parent_id` bigint NULL DEFAULT NULL COMMENT '父级 ID';

-- product（商品）
ALTER TABLE `product` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `product` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `product` MODIFY COLUMN `mdb_id` int NULL DEFAULT NULL COMMENT 'MDB 外部系统 ID';
ALTER TABLE `product` MODIFY COLUMN `type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '商品类型';
ALTER TABLE `product` MODIFY COLUMN `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '商品状态（ACTIVE/INACTIVE 等）';
ALTER TABLE `product` MODIFY COLUMN `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '描述';
ALTER TABLE `product` MODIFY COLUMN `category_id` bigint NULL DEFAULT NULL COMMENT '分类 ID';
ALTER TABLE `product` MODIFY COLUMN `brand_id` bigint NULL DEFAULT NULL COMMENT '品牌 ID';
ALTER TABLE `product` MODIFY COLUMN `family_id` bigint NULL DEFAULT NULL COMMENT '产品系列 ID';
ALTER TABLE `product` MODIFY COLUMN `align_family` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否与系列对齐';
ALTER TABLE `product` MODIFY COLUMN `core_supplier_id` bigint NULL DEFAULT NULL COMMENT '核心供应商 ID';
ALTER TABLE `product` MODIFY COLUMN `tax_rate_id` bigint NULL DEFAULT NULL COMMENT '税率 ID';
ALTER TABLE `product` MODIFY COLUMN `cost_tax_rate_id` bigint NULL DEFAULT NULL COMMENT '成本税率 ID';
ALTER TABLE `product` MODIFY COLUMN `cost` decimal(14, 4) NULL DEFAULT NULL COMMENT '成本';
ALTER TABLE `product` MODIFY COLUMN `case_quantity` decimal(14, 4) NULL DEFAULT NULL COMMENT '箱规（每箱数量）';
ALTER TABLE `product` MODIFY COLUMN `cost_percentage` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否按成本百分比定价';
ALTER TABLE `product` MODIFY COLUMN `track_inventory` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否跟踪库存';
ALTER TABLE `product` MODIFY COLUMN `use_scales` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否使用电子秤';
ALTER TABLE `product` MODIFY COLUMN `use_barcode_templates` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否使用条码模板';
ALTER TABLE `product` MODIFY COLUMN `use_price_label` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否使用价签';
ALTER TABLE `product` MODIFY COLUMN `prevent_manual_discounts` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否禁止手动折扣';
ALTER TABLE `product` MODIFY COLUMN `request_quantity` tinyint(1) NOT NULL DEFAULT 0 COMMENT '收银时是否询问数量';
ALTER TABLE `product` MODIFY COLUMN `request_price` tinyint(1) NOT NULL DEFAULT 0 COMMENT '收银时是否询问价格';
ALTER TABLE `product` MODIFY COLUMN `order_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '订货备注';
ALTER TABLE `product` MODIFY COLUMN `invoice_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '发票备注';
ALTER TABLE `product` MODIFY COLUMN `ticket_information` json NULL COMMENT '价签信息（JSON）';
ALTER TABLE `product` MODIFY COLUMN `image` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '商品图片 URL';
ALTER TABLE `product` MODIFY COLUMN `alternate_images` json NULL COMMENT '备用图片（JSON）';
ALTER TABLE `product` MODIFY COLUMN `metcash_msc` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT 'Metcash MSC 编码';
ALTER TABLE `product` MODIFY COLUMN `temp_product` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否临时商品';
ALTER TABLE `product` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';
ALTER TABLE `product` MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';
ALTER TABLE `product` MODIFY COLUMN `deleted_at` datetime NULL DEFAULT NULL COMMENT '删除时间（软删除）';

-- product_backorder（商品缺货预订）
ALTER TABLE `product_backorder` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `product_backorder` MODIFY COLUMN `product_id` bigint NULL DEFAULT NULL COMMENT '商品 ID';
ALTER TABLE `product_backorder` MODIFY COLUMN `customer_id` bigint NULL DEFAULT NULL COMMENT '客户 ID';
ALTER TABLE `product_backorder` MODIFY COLUMN `outlet_id` bigint NULL DEFAULT NULL COMMENT '门店 ID';
ALTER TABLE `product_backorder` MODIFY COLUMN `on_order_id` bigint NULL DEFAULT NULL COMMENT '在途订单 ID';
ALTER TABLE `product_backorder` MODIFY COLUMN `quantity` decimal(14, 4) NULL DEFAULT NULL COMMENT '数量';
ALTER TABLE `product_backorder` MODIFY COLUMN `recurring_period` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '重复周期';
ALTER TABLE `product_backorder` MODIFY COLUMN `next_due_date` datetime NULL DEFAULT NULL COMMENT '下次到期日';
ALTER TABLE `product_backorder` MODIFY COLUMN `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '备注';
ALTER TABLE `product_backorder` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';
ALTER TABLE `product_backorder` MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

-- product_barcode（商品条码）
ALTER TABLE `product_barcode` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `product_barcode` MODIFY COLUMN `product_id` bigint NOT NULL COMMENT '商品 ID';
ALTER TABLE `product_barcode` MODIFY COLUMN `code` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '条码';
ALTER TABLE `product_barcode` MODIFY COLUMN `quantity` decimal(14, 4) NOT NULL DEFAULT 1.0000 COMMENT '数量';
ALTER TABLE `product_barcode` MODIFY COLUMN `template_id` bigint NULL DEFAULT NULL COMMENT '模板 ID';
ALTER TABLE `product_barcode` MODIFY COLUMN `promotion_price` decimal(14, 4) NULL DEFAULT NULL COMMENT '促销价';
ALTER TABLE `product_barcode` MODIFY COLUMN `last_sold_at` datetime NULL DEFAULT NULL COMMENT '最近销售时间';
ALTER TABLE `product_barcode` MODIFY COLUMN `last_stocktaked_at` datetime NULL DEFAULT NULL COMMENT '最近盘点时间';

-- product_competition_price（竞品价格）
ALTER TABLE `product_competition_price` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `product_competition_price` MODIFY COLUMN `product_id` bigint NOT NULL COMMENT '商品 ID';
ALTER TABLE `product_competition_price` MODIFY COLUMN `competitor` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '竞争对手';
ALTER TABLE `product_competition_price` MODIFY COLUMN `price` decimal(14, 4) NULL DEFAULT NULL COMMENT '价格';
ALTER TABLE `product_competition_price` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

-- product_cost（商品成本）
ALTER TABLE `product_cost` MODIFY COLUMN `product_id` bigint NOT NULL COMMENT '商品 ID';
ALTER TABLE `product_cost` MODIFY COLUMN `outlet_id` bigint NOT NULL COMMENT '门店 ID';
ALTER TABLE `product_cost` MODIFY COLUMN `cost` decimal(14, 4) NULL DEFAULT NULL COMMENT '成本';
ALTER TABLE `product_cost` MODIFY COLUMN `last_cost` decimal(14, 4) NULL DEFAULT NULL COMMENT '最近成本';
ALTER TABLE `product_cost` MODIFY COLUMN `average_cost` decimal(14, 4) NULL DEFAULT NULL COMMENT '平均成本';

-- product_inventory（商品库存）
ALTER TABLE `product_inventory` MODIFY COLUMN `product_id` bigint NOT NULL COMMENT '商品 ID';
ALTER TABLE `product_inventory` MODIFY COLUMN `outlet_id` bigint NOT NULL COMMENT '门店 ID';
ALTER TABLE `product_inventory` MODIFY COLUMN `quantity` decimal(14, 4) NOT NULL DEFAULT 0.0000 COMMENT '库存数量';
ALTER TABLE `product_inventory` MODIFY COLUMN `reorder_level` decimal(14, 4) NULL DEFAULT NULL COMMENT '再订货点';
ALTER TABLE `product_inventory` MODIFY COLUMN `reorder_amount` decimal(14, 4) NULL DEFAULT NULL COMMENT '再订货量';
ALTER TABLE `product_inventory` MODIFY COLUMN `reorder_limit` decimal(14, 4) NULL DEFAULT NULL COMMENT '再订货上限';
ALTER TABLE `product_inventory` MODIFY COLUMN `max_quantity` decimal(14, 4) NULL DEFAULT NULL COMMENT '最大库存量';
ALTER TABLE `product_inventory` MODIFY COLUMN `reorder_rounding` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT 'NONE' COMMENT '再订货取整方式';
ALTER TABLE `product_inventory` MODIFY COLUMN `on_order` decimal(14, 4) NOT NULL DEFAULT 0.0000 COMMENT '在途数量';

-- product_price（商品价格）
ALTER TABLE `product_price` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `product_price` MODIFY COLUMN `product_id` bigint NOT NULL COMMENT '商品 ID';
ALTER TABLE `product_price` MODIFY COLUMN `price_set_id` bigint NULL DEFAULT NULL COMMENT '价格组 ID';
ALTER TABLE `product_price` MODIFY COLUMN `quantity` decimal(14, 4) NOT NULL DEFAULT 1.0000 COMMENT '价格对应数量';
ALTER TABLE `product_price` MODIFY COLUMN `price` decimal(14, 4) NOT NULL COMMENT '价格';
ALTER TABLE `product_price` MODIFY COLUMN `price_ex` decimal(14, 4) NULL DEFAULT NULL COMMENT '不含税价格';

-- product_supplier（商品供应商）
ALTER TABLE `product_supplier` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `product_supplier` MODIFY COLUMN `product_id` bigint NOT NULL COMMENT '商品 ID';
ALTER TABLE `product_supplier` MODIFY COLUMN `supplier_id` bigint NOT NULL COMMENT '供应商 ID';
ALTER TABLE `product_supplier` MODIFY COLUMN `code` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '供应商商品编码（SKU）';
ALTER TABLE `product_supplier` MODIFY COLUMN `minimum_order_quantity` int NULL DEFAULT NULL COMMENT '该供应商最小订货量';

-- product_tag（商品标签关联）
ALTER TABLE `product_tag` MODIFY COLUMN `product_id` bigint NOT NULL COMMENT '商品 ID';
ALTER TABLE `product_tag` MODIFY COLUMN `tag_id` bigint NOT NULL COMMENT '标签 ID';

-- promotion（促销）
ALTER TABLE `promotion` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `promotion` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `promotion` MODIFY COLUMN `mdb_id` int NULL DEFAULT NULL COMMENT 'MDB 外部系统 ID';
ALTER TABLE `promotion` MODIFY COLUMN `client_id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '客户端 ID';
ALTER TABLE `promotion` MODIFY COLUMN `promotion_category_id` bigint NULL DEFAULT NULL COMMENT '促销分类 ID';
ALTER TABLE `promotion` MODIFY COLUMN `start` datetime NULL DEFAULT NULL COMMENT '促销开始时间';
ALTER TABLE `promotion` MODIFY COLUMN `end` datetime NULL DEFAULT NULL COMMENT '促销结束时间';
ALTER TABLE `promotion` MODIFY COLUMN `express` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否快捷促销';
ALTER TABLE `promotion` MODIFY COLUMN `mix_criteria` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否混合条件';
ALTER TABLE `promotion` MODIFY COLUMN `active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否启用';
ALTER TABLE `promotion` MODIFY COLUMN `sale_max_application_count` int NULL DEFAULT NULL COMMENT '单笔销售最大应用次数';
ALTER TABLE `promotion` MODIFY COLUMN `deleted_at` datetime NULL DEFAULT NULL COMMENT '删除时间（软删除）';

-- promotion_category（促销分类）
ALTER TABLE `promotion_category` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `promotion_category` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `promotion_category` MODIFY COLUMN `mdb_id` int NULL DEFAULT NULL COMMENT 'MDB 外部系统 ID';
ALTER TABLE `promotion_category` MODIFY COLUMN `show_on_order` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否在订单中显示';
ALTER TABLE `promotion_category` MODIFY COLUMN `include_in_integrations` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否纳入集成';
ALTER TABLE `promotion_category` MODIFY COLUMN `deleted_at` datetime NULL DEFAULT NULL COMMENT '删除时间（软删除）';

-- promotion_criteria（促销条件）
ALTER TABLE `promotion_criteria` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `promotion_criteria` MODIFY COLUMN `promotion_id` bigint NOT NULL COMMENT '促销 ID';
ALTER TABLE `promotion_criteria` MODIFY COLUMN `type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '促销类型';
ALTER TABLE `promotion_criteria` MODIFY COLUMN `buy_amount` decimal(14, 4) NULL DEFAULT NULL COMMENT '购买数量/金额';
ALTER TABLE `promotion_criteria` MODIFY COLUMN `buy_amount_max` decimal(14, 4) NULL DEFAULT NULL COMMENT '购买数量/金额上限';
ALTER TABLE `promotion_criteria` MODIFY COLUMN `buy_amount_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '购买计量类型';
ALTER TABLE `promotion_criteria` MODIFY COLUMN `discount_amount` decimal(14, 4) NULL DEFAULT NULL COMMENT '折扣量';
ALTER TABLE `promotion_criteria` MODIFY COLUMN `min_quantity` decimal(14, 4) NULL DEFAULT NULL COMMENT '最小数量';
ALTER TABLE `promotion_criteria` MODIFY COLUMN `quantity_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '数量类型';
ALTER TABLE `promotion_criteria` MODIFY COLUMN `mixed_only` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否仅混合';
ALTER TABLE `promotion_criteria` MODIFY COLUMN `optional` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否可选';

-- promotion_customer_group（促销客户组）
ALTER TABLE `promotion_customer_group` MODIFY COLUMN `promotion_id` bigint NOT NULL COMMENT '促销 ID';
ALTER TABLE `promotion_customer_group` MODIFY COLUMN `customer_group_id` bigint NOT NULL COMMENT '客户组 ID';

-- promotion_outlet（促销门店）
ALTER TABLE `promotion_outlet` MODIFY COLUMN `promotion_id` bigint NOT NULL COMMENT '促销 ID';
ALTER TABLE `promotion_outlet` MODIFY COLUMN `outlet_id` bigint NOT NULL COMMENT '门店 ID';

-- purchase_order（采购/调拨订单）
ALTER TABLE `purchase_order` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `purchase_order` MODIFY COLUMN `type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '订单类型（ORDER/TRANSFER/CREDIT 等）';
ALTER TABLE `purchase_order` MODIFY COLUMN `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '订单状态';
ALTER TABLE `purchase_order` MODIFY COLUMN `from_id` bigint NULL DEFAULT NULL COMMENT '来源 ID（供应商或门店）';
ALTER TABLE `purchase_order` MODIFY COLUMN `to_id` bigint NULL DEFAULT NULL COMMENT '目标 ID（门店或调拨方）';
ALTER TABLE `purchase_order` MODIFY COLUMN `order_date` date NULL DEFAULT NULL COMMENT '订单日期';
ALTER TABLE `purchase_order` MODIFY COLUMN `due_date` date NULL DEFAULT NULL COMMENT '到期日期';
ALTER TABLE `purchase_order` MODIFY COLUMN `entered_as` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '录入税类型';
ALTER TABLE `purchase_order` MODIFY COLUMN `invoice_number` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '发票号';
ALTER TABLE `purchase_order` MODIFY COLUMN `reference` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '参考号/单号';
ALTER TABLE `purchase_order` MODIFY COLUMN `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '备注';
ALTER TABLE `purchase_order` MODIFY COLUMN `internal_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '内部备注';
ALTER TABLE `purchase_order` MODIFY COLUMN `include_freight` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否含运费';
ALTER TABLE `purchase_order` MODIFY COLUMN `total_cost` decimal(14, 2) NULL DEFAULT NULL COMMENT '总成本';
ALTER TABLE `purchase_order` MODIFY COLUMN `expected_total` decimal(14, 2) NULL DEFAULT NULL COMMENT '预期总额';
ALTER TABLE `purchase_order` MODIFY COLUMN `fee_percentage` decimal(8, 4) NULL DEFAULT NULL COMMENT '费用百分比';
ALTER TABLE `purchase_order` MODIFY COLUMN `line_count` int NOT NULL DEFAULT 0 COMMENT '行数';
ALTER TABLE `purchase_order` MODIFY COLUMN `created_by_id` bigint NULL DEFAULT NULL COMMENT '创建人 ID';
ALTER TABLE `purchase_order` MODIFY COLUMN `sent_by_id` bigint NULL DEFAULT NULL COMMENT '发送人 ID';
ALTER TABLE `purchase_order` MODIFY COLUMN `received_by_id` bigint NULL DEFAULT NULL COMMENT '收货人 ID';
ALTER TABLE `purchase_order` MODIFY COLUMN `merged_into_id` bigint NULL DEFAULT NULL COMMENT '合并至订单 ID';
ALTER TABLE `purchase_order` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';
ALTER TABLE `purchase_order` MODIFY COLUMN `sent_at` datetime NULL DEFAULT NULL COMMENT '发送时间';
ALTER TABLE `purchase_order` MODIFY COLUMN `received_at` datetime NULL DEFAULT NULL COMMENT '收货时间';

-- push_device（推送设备）
ALTER TABLE `push_device` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `push_device` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '名称';
ALTER TABLE `push_device` MODIFY COLUMN `endpoint` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '推送端点';
ALTER TABLE `push_device` MODIFY COLUMN `notifications` json NULL COMMENT '通知配置（JSON）';
ALTER TABLE `push_device` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

-- quick_menu_item（快捷菜单项）
ALTER TABLE `quick_menu_item` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `quick_menu_item` MODIFY COLUMN `user_id` bigint NULL DEFAULT NULL COMMENT '用户 ID';
ALTER TABLE `quick_menu_item` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '菜单名称';
ALTER TABLE `quick_menu_item` MODIFY COLUMN `url` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '链接地址';
ALTER TABLE `quick_menu_item` MODIFY COLUMN `external` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否外部链接';
ALTER TABLE `quick_menu_item` MODIFY COLUMN `position` int NOT NULL DEFAULT 0 COMMENT '排序位置';

-- receipt（小票模板）
ALTER TABLE `receipt` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `receipt` MODIFY COLUMN `name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `receipt` MODIFY COLUMN `type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '小票类型';
ALTER TABLE `receipt` MODIFY COLUMN `components` json NULL COMMENT '组件配置（JSON）';
ALTER TABLE `receipt` MODIFY COLUMN `receipt_width` int NULL DEFAULT NULL COMMENT '小票宽度';
ALTER TABLE `receipt` MODIFY COLUMN `account_receipt` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否账单小票';

-- register（收银机）
ALTER TABLE `register` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `register` MODIFY COLUMN `name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `register` MODIFY COLUMN `outlet_id` bigint NOT NULL COMMENT '门店 ID';
ALTER TABLE `register` MODIFY COLUMN `invoice_number` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '当前发票号';
ALTER TABLE `register` MODIFY COLUMN `open_time` datetime NULL DEFAULT NULL COMMENT '开班时间';
ALTER TABLE `register` MODIFY COLUMN `closed` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否已关闭';
ALTER TABLE `register` MODIFY COLUMN `surcharging` json NULL COMMENT '附加费配置（JSON）';
ALTER TABLE `register` MODIFY COLUMN `deleted_at` datetime NULL DEFAULT NULL COMMENT '删除时间（软删除）';

-- register_closure（收银机日结）
ALTER TABLE `register_closure` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `register_closure` MODIFY COLUMN `register_id` bigint NOT NULL COMMENT '收银机 ID';
ALTER TABLE `register_closure` MODIFY COLUMN `user_id` bigint NULL DEFAULT NULL COMMENT '用户 ID';
ALTER TABLE `register_closure` MODIFY COLUMN `movement` decimal(14, 2) NULL DEFAULT NULL COMMENT '现金变动';
ALTER TABLE `register_closure` MODIFY COLUMN `total_expected` decimal(14, 2) NULL DEFAULT NULL COMMENT '预期总额';
ALTER TABLE `register_closure` MODIFY COLUMN `total_received` decimal(14, 2) NULL DEFAULT NULL COMMENT '实收总额';
ALTER TABLE `register_closure` MODIFY COLUMN `total_transactions` int NULL DEFAULT NULL COMMENT '交易笔数';
ALTER TABLE `register_closure` MODIFY COLUMN `total_surcharge` decimal(14, 2) NULL DEFAULT NULL COMMENT '附加费总额';
ALTER TABLE `register_closure` MODIFY COLUMN `opened_at` datetime NULL DEFAULT NULL COMMENT '开启时间';
ALTER TABLE `register_closure` MODIFY COLUMN `closed_at` datetime NULL DEFAULT NULL COMMENT '关闭时间';
ALTER TABLE `register_closure` MODIFY COLUMN `note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '备注';

-- register_closure_payment（日结支付方式汇总）
ALTER TABLE `register_closure_payment` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `register_closure_payment` MODIFY COLUMN `closure_id` bigint NOT NULL COMMENT '日结 ID';
ALTER TABLE `register_closure_payment` MODIFY COLUMN `payment_method_id` bigint NULL DEFAULT NULL COMMENT '支付方式 ID';
ALTER TABLE `register_closure_payment` MODIFY COLUMN `expected` decimal(14, 2) NULL DEFAULT NULL COMMENT '预期金额';
ALTER TABLE `register_closure_payment` MODIFY COLUMN `received` decimal(14, 2) NULL DEFAULT NULL COMMENT '实收金额';

-- register_payment_method（收银机支付方式）
ALTER TABLE `register_payment_method` MODIFY COLUMN `register_id` bigint NOT NULL COMMENT '收银机 ID';
ALTER TABLE `register_payment_method` MODIFY COLUMN `payment_method_id` bigint NOT NULL COMMENT '支付方式 ID';

-- report（报表）
ALTER TABLE `report` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `report` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '报表名称';
ALTER TABLE `report` MODIFY COLUMN `type` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '报表类型';
ALTER TABLE `report` MODIFY COLUMN `query` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '查询语句';
ALTER TABLE `report` MODIFY COLUMN `special` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否特殊报表';
ALTER TABLE `report` MODIFY COLUMN `email_settings` json NULL COMMENT '邮件设置（JSON）';
ALTER TABLE `report` MODIFY COLUMN `filter` json NULL COMMENT '筛选条件（JSON）';
ALTER TABLE `report` MODIFY COLUMN `owner_id` bigint NULL DEFAULT NULL COMMENT '所有者 ID';
ALTER TABLE `report` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

-- role（角色）
ALTER TABLE `role` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `role` MODIFY COLUMN `name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `role` MODIFY COLUMN `managed_id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '托管角色 ID';

-- role_permission（角色权限）
ALTER TABLE `role_permission` MODIFY COLUMN `role_id` bigint NOT NULL COMMENT '角色 ID';
ALTER TABLE `role_permission` MODIFY COLUMN `permission_id` int NOT NULL COMMENT '权限 ID';

-- sale（销售单）
ALTER TABLE `sale` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `sale` MODIFY COLUMN `client_id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '客户端 ID';
ALTER TABLE `sale` MODIFY COLUMN `linked_sale_id` bigint NULL DEFAULT NULL COMMENT '关联销售单 ID';
ALTER TABLE `sale` MODIFY COLUMN `register_id` bigint NULL DEFAULT NULL COMMENT '收银机 ID';
ALTER TABLE `sale` MODIFY COLUMN `user_id` bigint NULL DEFAULT NULL COMMENT '用户 ID';
ALTER TABLE `sale` MODIFY COLUMN `customer_id` bigint NULL DEFAULT NULL COMMENT '客户 ID';
ALTER TABLE `sale` MODIFY COLUMN `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '销售状态（COMPLETED/VOIDED/PARKED 等）';
ALTER TABLE `sale` MODIFY COLUMN `account_sale` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否挂账销售';
ALTER TABLE `sale` MODIFY COLUMN `invoice_id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '发票编号';
ALTER TABLE `sale` MODIFY COLUMN `note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '备注';
ALTER TABLE `sale` MODIFY COLUMN `internal_note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '内部备注';
ALTER TABLE `sale` MODIFY COLUMN `order_reference` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '订单参考号';
ALTER TABLE `sale` MODIFY COLUMN `discount_amount` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '折扣（金额或百分比）';
ALTER TABLE `sale` MODIFY COLUMN `discount_reason` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '折扣原因';
ALTER TABLE `sale` MODIFY COLUMN `loyalty_value` decimal(14, 4) NULL DEFAULT NULL COMMENT '积分值';
ALTER TABLE `sale` MODIFY COLUMN `total_quantity` int NOT NULL DEFAULT 0 COMMENT '总数量';
ALTER TABLE `sale` MODIFY COLUMN `total_cost` decimal(14, 4) NULL DEFAULT NULL COMMENT '总成本';
ALTER TABLE `sale` MODIFY COLUMN `total_savings` decimal(14, 2) NULL DEFAULT NULL COMMENT '总节省';
ALTER TABLE `sale` MODIFY COLUMN `total_discount` decimal(14, 2) NULL DEFAULT NULL COMMENT '总折扣';
ALTER TABLE `sale` MODIFY COLUMN `total_tax` decimal(14, 2) NULL DEFAULT NULL COMMENT '总税额';
ALTER TABLE `sale` MODIFY COLUMN `cashout` decimal(14, 2) NULL DEFAULT NULL COMMENT '取现/找零';
ALTER TABLE `sale` MODIFY COLUMN `total_change` decimal(14, 2) NULL DEFAULT NULL COMMENT '找零总额';
ALTER TABLE `sale` MODIFY COLUMN `total_rounding` decimal(14, 4) NULL DEFAULT NULL COMMENT '抹零总额';
ALTER TABLE `sale` MODIFY COLUMN `total_price` decimal(14, 2) NOT NULL DEFAULT 0.00 COMMENT '总价';
ALTER TABLE `sale` MODIFY COLUMN `outstanding` decimal(14, 2) NOT NULL DEFAULT 0.00 COMMENT '未付金额';
ALTER TABLE `sale` MODIFY COLUMN `refund_reason` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '退款原因';
ALTER TABLE `sale` MODIFY COLUMN `meta_data` json NULL COMMENT '扩展元数据（JSON）';
ALTER TABLE `sale` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';
ALTER TABLE `sale` MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';
ALTER TABLE `sale` MODIFY COLUMN `uploaded_at` datetime NULL DEFAULT NULL COMMENT '上传时间';

-- sale_item（销售明细）
ALTER TABLE `sale_item` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `sale_item` MODIFY COLUMN `sale_id` bigint NOT NULL COMMENT '销售单 ID';
ALTER TABLE `sale_item` MODIFY COLUMN `product_id` bigint NULL DEFAULT NULL COMMENT '商品 ID';
ALTER TABLE `sale_item` MODIFY COLUMN `quantity` decimal(14, 4) NOT NULL COMMENT '数量';
ALTER TABLE `sale_item` MODIFY COLUMN `case_quantity` decimal(14, 4) NULL DEFAULT NULL COMMENT '箱规（每箱数量）';
ALTER TABLE `sale_item` MODIFY COLUMN `cost` decimal(14, 4) NULL DEFAULT NULL COMMENT '成本';
ALTER TABLE `sale_item` MODIFY COLUMN `base_price` decimal(14, 4) NULL DEFAULT NULL COMMENT '基础售价';
ALTER TABLE `sale_item` MODIFY COLUMN `total_price` decimal(14, 2) NULL DEFAULT NULL COMMENT '总价';
ALTER TABLE `sale_item` MODIFY COLUMN `savings` decimal(14, 2) NULL DEFAULT NULL COMMENT '节省金额';
ALTER TABLE `sale_item` MODIFY COLUMN `tax` decimal(14, 2) NULL DEFAULT NULL COMMENT '税额';
ALTER TABLE `sale_item` MODIFY COLUMN `tax_rate_id` bigint NULL DEFAULT NULL COMMENT '税率 ID';
ALTER TABLE `sale_item` MODIFY COLUMN `discount_amount` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '行折扣（金额或百分比）';
ALTER TABLE `sale_item` MODIFY COLUMN `discount_reason` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '折扣原因';
ALTER TABLE `sale_item` MODIFY COLUMN `note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '备注';
ALTER TABLE `sale_item` MODIFY COLUMN `loyalty_value` decimal(14, 4) NULL DEFAULT NULL COMMENT '积分值';
ALTER TABLE `sale_item` MODIFY COLUMN `meta_data` json NULL COMMENT '扩展元数据（JSON）';

-- sale_keys（销售快捷键）
ALTER TABLE `sale_keys` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `sale_keys` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '名称';
ALTER TABLE `sale_keys` MODIFY COLUMN `sale_keys` json NULL COMMENT '销售快捷键（JSON）';
ALTER TABLE `sale_keys` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

-- sale_payment（销售支付）
ALTER TABLE `sale_payment` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `sale_payment` MODIFY COLUMN `sale_id` bigint NOT NULL COMMENT '销售单 ID';
ALTER TABLE `sale_payment` MODIFY COLUMN `payment_method_id` bigint NULL DEFAULT NULL COMMENT '支付方式 ID';
ALTER TABLE `sale_payment` MODIFY COLUMN `subtype` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '支付子类型';
ALTER TABLE `sale_payment` MODIFY COLUMN `register_id` bigint NULL DEFAULT NULL COMMENT '收银机 ID';
ALTER TABLE `sale_payment` MODIFY COLUMN `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '支付状态';
ALTER TABLE `sale_payment` MODIFY COLUMN `amount` decimal(14, 2) NOT NULL COMMENT '金额/数量';
ALTER TABLE `sale_payment` MODIFY COLUMN `rounding` decimal(14, 4) NULL DEFAULT NULL COMMENT '抹零/四舍五入';
ALTER TABLE `sale_payment` MODIFY COLUMN `cashout` decimal(14, 2) NULL DEFAULT NULL COMMENT '取现/找零';
ALTER TABLE `sale_payment` MODIFY COLUMN `process_time` datetime NULL DEFAULT NULL COMMENT '处理时间';
ALTER TABLE `sale_payment` MODIFY COLUMN `receipt` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '小票内容';
ALTER TABLE `sale_payment` MODIFY COLUMN `customer_payment_id` bigint NULL DEFAULT NULL COMMENT '客户付款 ID';
ALTER TABLE `sale_payment` MODIFY COLUMN `cancelled_at` datetime NULL DEFAULT NULL COMMENT '取消时间';
ALTER TABLE `sale_payment` MODIFY COLUMN `meta_data` json NULL COMMENT '扩展元数据（JSON）';

-- security_event（安全事件）
ALTER TABLE `security_event` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `security_event` MODIFY COLUMN `outlet_id` bigint NULL DEFAULT NULL COMMENT '门店 ID';
ALTER TABLE `security_event` MODIFY COLUMN `register_id` bigint NULL DEFAULT NULL COMMENT '收银机 ID';
ALTER TABLE `security_event` MODIFY COLUMN `user_id` bigint NULL DEFAULT NULL COMMENT '用户 ID';
ALTER TABLE `security_event` MODIFY COLUMN `device_id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '设备 ID';
ALTER TABLE `security_event` MODIFY COLUMN `event` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '事件类型';
ALTER TABLE `security_event` MODIFY COLUMN `meta_data` json NULL COMMENT '扩展元数据（JSON）';
ALTER TABLE `security_event` MODIFY COLUMN `ipv4` varchar(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT 'IPv4 地址';
ALTER TABLE `security_event` MODIFY COLUMN `ipv6` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT 'IPv6 地址';
ALTER TABLE `security_event` MODIFY COLUMN `user_agent` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '用户代理';
ALTER TABLE `security_event` MODIFY COLUMN `timestamp` datetime NOT NULL COMMENT '时间戳';

-- settings（系统设置）
ALTER TABLE `settings` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `settings` MODIFY COLUMN `scope_type` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '作用域类型（vendor/outlet/register/user）';
ALTER TABLE `settings` MODIFY COLUMN `scope_id` bigint NULL DEFAULT NULL COMMENT '作用域 ID';
ALTER TABLE `settings` MODIFY COLUMN `name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '设置项名称';
ALTER TABLE `settings` MODIFY COLUMN `value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '设置值';
ALTER TABLE `settings` MODIFY COLUMN `datatype` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '数据类型';
ALTER TABLE `settings` MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

-- shelf_ticket（货架价签）
ALTER TABLE `shelf_ticket` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `shelf_ticket` MODIFY COLUMN `product_id` bigint NULL DEFAULT NULL COMMENT '商品 ID';
ALTER TABLE `shelf_ticket` MODIFY COLUMN `outlet_id` bigint NULL DEFAULT NULL COMMENT '门店 ID';
ALTER TABLE `shelf_ticket` MODIFY COLUMN `user_id` bigint NULL DEFAULT NULL COMMENT '用户 ID';
ALTER TABLE `shelf_ticket` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

-- statement（对账单模板）
ALTER TABLE `statement` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `statement` MODIFY COLUMN `name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `statement` MODIFY COLUMN `components` json NULL COMMENT '组件配置（JSON）';
ALTER TABLE `statement` MODIFY COLUMN `signature` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '签名';
ALTER TABLE `statement` MODIFY COLUMN `reply_to` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '回复地址';
ALTER TABLE `statement` MODIFY COLUMN `subject` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '主题';

-- stocktake（盘点）
ALTER TABLE `stocktake` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `stocktake` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `stocktake` MODIFY COLUMN `type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '盘点类型';
ALTER TABLE `stocktake` MODIFY COLUMN `outlet_id` bigint NULL DEFAULT NULL COMMENT '门店 ID';
ALTER TABLE `stocktake` MODIFY COLUMN `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '盘点状态';
ALTER TABLE `stocktake` MODIFY COLUMN `display_expected` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否显示预期数量';
ALTER TABLE `stocktake` MODIFY COLUMN `applied` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否已应用';
ALTER TABLE `stocktake` MODIFY COLUMN `completed_by_id` bigint NULL DEFAULT NULL COMMENT '完成人 ID';
ALTER TABLE `stocktake` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';
ALTER TABLE `stocktake` MODIFY COLUMN `completed_at` datetime NULL DEFAULT NULL COMMENT '完成时间';

-- stocktake_product（盘点商品）
ALTER TABLE `stocktake_product` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `stocktake_product` MODIFY COLUMN `stocktake_id` bigint NOT NULL COMMENT '盘点 ID';
ALTER TABLE `stocktake_product` MODIFY COLUMN `product_id` bigint NOT NULL COMMENT '商品 ID';
ALTER TABLE `stocktake_product` MODIFY COLUMN `cost` decimal(14, 4) NULL DEFAULT NULL COMMENT '成本';
ALTER TABLE `stocktake_product` MODIFY COLUMN `case_quantity` decimal(14, 4) NULL DEFAULT NULL COMMENT '箱规（每箱数量）';
ALTER TABLE `stocktake_product` MODIFY COLUMN `scanned` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否已扫描';
ALTER TABLE `stocktake_product` MODIFY COLUMN `expected_count` decimal(14, 4) NULL DEFAULT NULL COMMENT '预期数量';
ALTER TABLE `stocktake_product` MODIFY COLUMN `expected_value` decimal(14, 2) NULL DEFAULT NULL COMMENT '预期金额';
ALTER TABLE `stocktake_product` MODIFY COLUMN `actual_count` decimal(14, 4) NULL DEFAULT NULL COMMENT '实际数量';
ALTER TABLE `stocktake_product` MODIFY COLUMN `actual_value` decimal(14, 2) NULL DEFAULT NULL COMMENT '实际金额';

-- supplier（供应商）
ALTER TABLE `supplier` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `supplier` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `supplier` MODIFY COLUMN `mdb_id` int NULL DEFAULT NULL COMMENT 'MDB 外部系统 ID';
ALTER TABLE `supplier` MODIFY COLUMN `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '供应商状态';
ALTER TABLE `supplier` MODIFY COLUMN `contact_id` bigint NULL DEFAULT NULL COMMENT '联系信息 ID';
ALTER TABLE `supplier` MODIFY COLUMN `business_number` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '商业登记号/税号';
ALTER TABLE `supplier` MODIFY COLUMN `account_number` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '账号';
ALTER TABLE `supplier` MODIFY COLUMN `order_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '订货备注';
ALTER TABLE `supplier` MODIFY COLUMN `internal_order_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT 'internal order notes';
ALTER TABLE `supplier` MODIFY COLUMN `order_automatic_email` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否自动邮件发送订单';
ALTER TABLE `supplier` MODIFY COLUMN `default_order_tax` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '默认订单税类型';
ALTER TABLE `supplier` MODIFY COLUMN `email_format` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '邮件格式';
ALTER TABLE `supplier` MODIFY COLUMN `comments` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '备注';
ALTER TABLE `supplier` MODIFY COLUMN `fee_amount` decimal(14, 4) NULL DEFAULT NULL COMMENT '费用金额';
ALTER TABLE `supplier` MODIFY COLUMN `distribute_fees` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '费用分摊方式';
ALTER TABLE `supplier` MODIFY COLUMN `distribute_freight` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '运费分摊方式';
ALTER TABLE `supplier` MODIFY COLUMN `freight_included_on_invoices` tinyint(1) NOT NULL DEFAULT 0 COMMENT '发票是否含运费';
ALTER TABLE `supplier` MODIFY COLUMN `freight_tax_id` bigint NULL DEFAULT NULL COMMENT '运费税率 ID，关联 freight_tax.id';
ALTER TABLE `supplier` MODIFY COLUMN `fees_tax_id` bigint NULL DEFAULT NULL COMMENT '费用税率 ID，关联 fees_tax.id';
ALTER TABLE `supplier` MODIFY COLUMN `allow_order_below_minimum` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否允许低于最小订货量';
ALTER TABLE `supplier` MODIFY COLUMN `minimum_order_value` decimal(14, 2) NULL DEFAULT NULL COMMENT '最小订货金额';
ALTER TABLE `supplier` MODIFY COLUMN `maximum_order_value` decimal(14, 2) NULL DEFAULT NULL COMMENT '最大订货金额';
ALTER TABLE `supplier` MODIFY COLUMN `default_days_until_due` int NULL DEFAULT NULL COMMENT '默认账期天数';
ALTER TABLE `supplier` MODIFY COLUMN `freight_fixed_cost_per_case` decimal(14, 4) NULL DEFAULT NULL COMMENT '每箱固定运费';
ALTER TABLE `supplier` MODIFY COLUMN `deleted_at` datetime NULL DEFAULT NULL COMMENT '删除时间（软删除）';

-- supplier_additional_contact（供应商附加联系人）
ALTER TABLE `supplier_additional_contact` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `supplier_additional_contact` MODIFY COLUMN `supplier_id` bigint NOT NULL COMMENT '供应商 ID';
ALTER TABLE `supplier_additional_contact` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '名称';
ALTER TABLE `supplier_additional_contact` MODIFY COLUMN `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '电子邮箱';
ALTER TABLE `supplier_additional_contact` MODIFY COLUMN `phone` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '电话';
ALTER TABLE `supplier_additional_contact` MODIFY COLUMN `sort_order` int NOT NULL DEFAULT 0 COMMENT '排序序号';

-- supplier_authentication（供应商认证）
ALTER TABLE `supplier_authentication` MODIFY COLUMN `supplier_id` bigint NOT NULL COMMENT '供应商 ID';
ALTER TABLE `supplier_authentication` MODIFY COLUMN `account_number` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '供应商账号';
ALTER TABLE `supplier_authentication` MODIFY COLUMN `username` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '供应商登录用户名';
ALTER TABLE `supplier_authentication` MODIFY COLUMN `password_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '密码哈希（BCrypt，禁止明文存储）';
ALTER TABLE `supplier_authentication` MODIFY COLUMN `additional_auth` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '附加认证信息';

-- tag（标签）
ALTER TABLE `tag` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `tag` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `tag` MODIFY COLUMN `mdb_id` int NULL DEFAULT NULL COMMENT 'MDB 外部系统 ID';
ALTER TABLE `tag` MODIFY COLUMN `deleted_at` datetime NULL DEFAULT NULL COMMENT '删除时间（软删除）';

-- tax_rate（税率）
ALTER TABLE `tax_rate` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `tax_rate` MODIFY COLUMN `name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `tax_rate` MODIFY COLUMN `amount` decimal(8, 4) NOT NULL COMMENT '税率百分比（如 10.0000 表示 10%）';
ALTER TABLE `tax_rate` MODIFY COLUMN `mdb_id` int NULL DEFAULT NULL COMMENT 'MDB 外部系统 ID';
ALTER TABLE `tax_rate` MODIFY COLUMN `is_default` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否默认';
ALTER TABLE `tax_rate` MODIFY COLUMN `deleted_at` datetime NULL DEFAULT NULL COMMENT '删除时间（软删除）';

-- ticket_template（价签模板）
ALTER TABLE `ticket_template` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `ticket_template` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '名称';
ALTER TABLE `ticket_template` MODIFY COLUMN `styles` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '样式';
ALTER TABLE `ticket_template` MODIFY COLUMN `transformation_script` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '转换脚本';
ALTER TABLE `ticket_template` MODIFY COLUMN `width` decimal(14, 4) NULL DEFAULT NULL COMMENT '宽度';
ALTER TABLE `ticket_template` MODIFY COLUMN `height` decimal(14, 4) NULL DEFAULT NULL COMMENT '高度';
ALTER TABLE `ticket_template` MODIFY COLUMN `fonts` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '字体配置';
ALTER TABLE `ticket_template` MODIFY COLUMN `fields_tracked` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '跟踪字段';
ALTER TABLE `ticket_template` MODIFY COLUMN `options` json NULL COMMENT '选项（JSON）';
ALTER TABLE `ticket_template` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

-- ticket_template_page（价签模板页面）
ALTER TABLE `ticket_template_page` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `ticket_template_page` MODIFY COLUMN `ticket_template_id` bigint NULL DEFAULT NULL COMMENT '价签模板 ID';
ALTER TABLE `ticket_template_page` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '名称';
ALTER TABLE `ticket_template_page` MODIFY COLUMN `horizontal_panels` int NULL DEFAULT NULL COMMENT '水平面板数';
ALTER TABLE `ticket_template_page` MODIFY COLUMN `vertical_panels` int NULL DEFAULT NULL COMMENT '垂直面板数';
ALTER TABLE `ticket_template_page` MODIFY COLUMN `page_width` decimal(14, 4) NULL DEFAULT NULL COMMENT '页面宽度';
ALTER TABLE `ticket_template_page` MODIFY COLUMN `page_height` decimal(14, 4) NULL DEFAULT NULL COMMENT '页面高度';
ALTER TABLE `ticket_template_page` MODIFY COLUMN `page_margin` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '页边距';
ALTER TABLE `ticket_template_page` MODIFY COLUMN `horizontal_panel_spacing` decimal(14, 4) NULL DEFAULT NULL COMMENT '水平面板间距';
ALTER TABLE `ticket_template_page` MODIFY COLUMN `vertical_panel_spacing` decimal(14, 4) NULL DEFAULT NULL COMMENT '垂直面板间距';
ALTER TABLE `ticket_template_page` MODIFY COLUMN `cutting_width` decimal(14, 4) NULL DEFAULT NULL COMMENT '裁切宽度';

-- transferee（调拨接收方）
ALTER TABLE `transferee` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `transferee` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `transferee` MODIFY COLUMN `contact_id` bigint NULL DEFAULT NULL COMMENT '联系信息 ID';
ALTER TABLE `transferee` MODIFY COLUMN `order_automatic_email` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否自动邮件发送订单';
ALTER TABLE `transferee` MODIFY COLUMN `email_format` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '邮件格式';
ALTER TABLE `transferee` MODIFY COLUMN `send_orders_to_accounts_flow` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'send orders to accounts flow';
ALTER TABLE `transferee` MODIFY COLUMN `deleted_at` datetime NULL DEFAULT NULL COMMENT '删除时间（软删除）';

-- trashed_item（回收站项）
ALTER TABLE `trashed_item` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `trashed_item` MODIFY COLUMN `item_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '回收条目类型（PRODUCT/CUSTOMER/SUPPLIER 等）';
ALTER TABLE `trashed_item` MODIFY COLUMN `item_id` bigint NOT NULL COMMENT '被删除条目 ID';
ALTER TABLE `trashed_item` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '条目名称';
ALTER TABLE `trashed_item` MODIFY COLUMN `deleted_at` datetime NOT NULL COMMENT '删除时间（软删除）';

-- user_reporting_outlet（用户报表门店）
ALTER TABLE `user_reporting_outlet` MODIFY COLUMN `user_id` bigint NOT NULL COMMENT '用户 ID';
ALTER TABLE `user_reporting_outlet` MODIFY COLUMN `outlet_id` bigint NOT NULL COMMENT '门店 ID';

-- vendor（商户/租户）
ALTER TABLE `vendor` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `vendor` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `vendor` MODIFY COLUMN `url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '网址';
ALTER TABLE `vendor` MODIFY COLUMN `business_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '业务类型';
ALTER TABLE `vendor` MODIFY COLUMN `contact_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '联系人姓名';
ALTER TABLE `vendor` MODIFY COLUMN `default_tax_rate_id` bigint NULL DEFAULT NULL COMMENT '默认税率 ID';
ALTER TABLE `vendor` MODIFY COLUMN `trial_ends_at` datetime NULL DEFAULT NULL COMMENT '试用结束时间';
ALTER TABLE `vendor` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';
ALTER TABLE `vendor` MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

-- vendor_connection（商户连接）
ALTER TABLE `vendor_connection` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `vendor_connection` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '名称';
ALTER TABLE `vendor_connection` MODIFY COLUMN `sender_code` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '发送方编码';
ALTER TABLE `vendor_connection` MODIFY COLUMN `customer_id` bigint NULL DEFAULT NULL COMMENT '关联客户 ID';

-- webhook（Webhook）
ALTER TABLE `webhook` MODIFY COLUMN `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键';
ALTER TABLE `webhook` MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '名称';
ALTER TABLE `webhook` MODIFY COLUMN `url` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '网址';
ALTER TABLE `webhook` MODIFY COLUMN `events` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '订阅事件';
ALTER TABLE `webhook` MODIFY COLUMN `signature_key` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '签名密钥';
ALTER TABLE `webhook` MODIFY COLUMN `integration_id` bigint NULL DEFAULT NULL COMMENT '集成 ID';
ALTER TABLE `webhook` MODIFY COLUMN `active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否启用';
ALTER TABLE `webhook` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';
