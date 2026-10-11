#!/usr/bin/env python3
"""Parse orithos.sql and generate Chinese column COMMENT annotations."""

import re
from pathlib import Path

ORITHOS_SQL = Path(__file__).resolve().parents[1] / "pos-api/src/main/resources/db/orithos.sql"
OUTPUT_SQL = Path(__file__).resolve().parent / "add_all_column_comments.sql"

# Table name -> Chinese label (for table-level context)
TABLE_ZH = {
    "app_user": "应用用户",
    "barcode_template": "条码模板",
    "brand": "品牌",
    "buying_period": "采购周期",
    "capped_price": "封顶价",
    "category": "分类",
    "contact": "联系信息",
    "customer": "客户",
    "customer_display": "客户显示屏",
    "customer_email": "客户邮箱",
    "customer_group": "客户组",
    "customer_payment": "客户付款",
    "customer_payment_allocation": "客户付款分配",
    "customer_revision": "客户变更记录",
    "external_stocktake": "外部盘点",
    "family": "产品系列",
    "future_cost": "未来成本",
    "future_price": "未来价格",
    "gift_card": "礼品卡",
    "gift_card_movement": "礼品卡流水",
    "host_change": "主机同步变更",
    "host_connection": "主机连接",
    "host_identifier": "主机标识映射",
    "integration": "集成",
    "kitchen_screen": "厨房屏",
    "mail_log": "邮件日志",
    "notification": "通知",
    "order_product": "订单商品行",
    "order_related": "关联订单",
    "order_review": "订单审核",
    "outlet": "门店",
    "payment_method": "支付方式",
    "permission": "权限",
    "price_list": "价目表",
    "price_list_item": "价目表条目",
    "price_set": "价格组",
    "product": "商品",
    "product_backorder": "商品缺货预订",
    "product_barcode": "商品条码",
    "product_competition_price": "竞品价格",
    "product_cost": "商品成本",
    "product_inventory": "商品库存",
    "product_price": "商品价格",
    "product_supplier": "商品供应商",
    "product_tag": "商品标签关联",
    "promotion": "促销",
    "promotion_category": "促销分类",
    "promotion_criteria": "促销条件",
    "promotion_customer_group": "促销客户组",
    "promotion_outlet": "促销门店",
    "purchase_order": "采购/调拨订单",
    "push_device": "推送设备",
    "quick_menu_item": "快捷菜单项",
    "receipt": "小票模板",
    "register": "收银机",
    "register_closure": "收银机日结",
    "register_closure_payment": "日结支付方式汇总",
    "register_payment_method": "收银机支付方式",
    "report": "报表",
    "role": "角色",
    "role_permission": "角色权限",
    "sale": "销售单",
    "sale_item": "销售明细",
    "sale_keys": "销售快捷键",
    "sale_payment": "销售支付",
    "security_event": "安全事件",
    "settings": "系统设置",
    "shelf_ticket": "货架价签",
    "statement": "对账单模板",
    "stocktake": "盘点",
    "stocktake_product": "盘点商品",
    "supplier": "供应商",
    "supplier_additional_contact": "供应商附加联系人",
    "supplier_authentication": "供应商认证",
    "tag": "标签",
    "tax_rate": "税率",
    "ticket_template": "价签模板",
    "ticket_template_page": "价签模板页面",
    "transferee": "调拨接收方",
    "trashed_item": "回收站项",
    "user_reporting_outlet": "用户报表门店",
    "vendor": "商户/租户",
    "vendor_connection": "商户连接",
    "webhook": "Webhook",
}

# FK target table -> Chinese
FK_ZH = {
    "product": "商品",
    "customer": "客户",
    "supplier": "供应商",
    "outlet": "门店",
    "register": "收银机",
    "user": "用户",
    "app_user": "用户",
    "role": "角色",
    "contact": "联系信息",
    "category": "分类",
    "brand": "品牌",
    "family": "产品系列",
    "tag": "标签",
    "tax_rate": "税率",
    "price_set": "价格组",
    "price_list": "价目表",
    "customer_group": "客户组",
    "payment_method": "支付方式",
    "sale": "销售单",
    "order": "订单",
    "purchase_order": "订单",
    "stocktake": "盘点",
    "gift_card": "礼品卡",
    "promotion": "促销",
    "promotion_category": "促销分类",
    "barcode_template": "条码模板",
    "ticket_template": "价签模板",
    "receipt": "小票模板",
    "statement": "对账单模板",
    "transferee": "调拨接收方",
    "host_connection": "主机连接",
    "integration": "集成",
    "vendor": "商户",
    "closure": "日结",
    "register_closure": "日结",
    "payment": "付款",
    "customer_payment": "客户付款",
    "related_order": "关联订单",
    "template": "模板",
    "item": "条目",
    "permission": "权限",
    "owner": "所有者",
    "completed": "完成记录",
    "on_order": "在途订单",
    "cashout_method": "找零方式",
    "core_supplier": "核心供应商",
    "cost_tax_rate": "成本税率",
    "default_tax_rate": "默认税率",
    "freight_tax": "运费税率",
    "fees_tax": "费用税率",
    "ticketing_price_set": "价签价格组",
    "sent_by": "发送人",
    "received_by": "收货人",
    "created_by": "创建人",
    "completed_by": "完成人",
    "relates_to": "关联记录",
    "linked_sale": "关联销售单",
    "merged_into": "合并至订单",
    "from": "来源",
    "to": "目标",
    "notifiable": "通知对象",
    "parent": "父级",
    "local": "本地",
    "host": "主机",
}

# Column-specific overrides (table.column or column)
COLUMN_ZH = {
    "id": "主键",
    "name": "名称",
    "username": "登录用户名",
    "password_hash": "密码哈希（BCrypt，禁止明文存储）",
    "email": "电子邮箱",
    "phone": "电话",
    "mobile": "手机",
    "fax": "传真",
    "image": "头像/图片 URL",
    "url": "网址",
    "website": "网站",
    "twitter": "Twitter",
    "facebook": "Facebook",
    "code": "编码",
    "description": "描述",
    "comments": "备注",
    "notes": "备注",
    "internal_notes": "内部备注",
    "internal_note": "内部备注",
    "note": "备注",
    "reference": "参考号/单号",
    "invoice_number": "发票号",
    "invoice_id": "发票编号",
    "invoice_message": "发票附言",
    "invoice_notes": "发票备注",
    "order_notes": "订货备注",
    "order_reference": "订单参考号",
    "business_number": "商业登记号/税号",
    "account_number": "账号",
    "status": "状态",
    "type": "类型",
    "amount": "金额/数量",
    "quantity": "数量",
    "price": "价格",
    "cost": "成本",
    "base_cost": "基础成本",
    "base_price": "基础售价",
    "last_cost": "最近成本",
    "average_cost": "平均成本",
    "case_quantity": "箱规（每箱数量）",
    "ordered_quantity": "订购数量",
    "received_quantity": "收货数量",
    "ordered_cost": "订购成本",
    "expected_count": "预期数量",
    "actual_count": "实际数量",
    "expected_value": "预期金额",
    "actual_value": "实际金额",
    "start_balance": "期初余额",
    "current_owing": "当前欠款",
    "account_limit": "账期额度",
    "outstanding": "未付金额",
    "total_price": "总价",
    "total_cost": "总成本",
    "total_tax": "总税额",
    "total_discount": "总折扣",
    "total_savings": "总节省",
    "total_quantity": "总数量",
    "total_change": "找零总额",
    "total_rounding": "抹零总额",
    "total_expected": "预期总额",
    "total_received": "实收总额",
    "total_transactions": "交易笔数",
    "total_surcharge": "附加费总额",
    "expected_total": "预期总额",
    "fee_amount": "费用金额",
    "fee_percentage": "费用百分比",
    "fees": "费用",
    "freight": "运费",
    "rebate": "返利",
    "rounding": "抹零/四舍五入",
    "cashout": "取现/找零",
    "surcharge": "附加费",
    "movement": "现金变动",
    "discount_amount": "折扣金额",
    "discount_reason": "折扣原因",
    "loyalty_value": "积分值",
    "loyalty_points": "积分余额",
    "loyalty_rate": "积分比率",
    "loyalty_enabled": "是否启用积分",
    "loyalty_name": "积分计划名称",
    "loyalty_earn_rate": "积分获取比率",
    "loyalty_redeem_rate": "积分兑换比率",
    "gender": "性别",
    "birthday": "生日",
    "first_name": "名",
    "last_name": "姓",
    "company": "公司名称",
    "sort_order": "排序序号",
    "position": "排序位置",
    "mdb_id": "MDB 外部系统 ID",
    "metcash_msc": "Metcash MSC 编码",
    "client_id": "客户端 ID",
    "device_id": "设备 ID",
    "sender_code": "发送方编码",
    "signature_key": "签名密钥",
    "signature": "签名",
    "subject": "主题",
    "recipient": "收件人",
    "reply_to": "回复地址",
    "template": "模板内容",
    "query": "查询语句",
    "config": "配置（JSON）",
    "metadata": "元数据（JSON）",
    "settings": "设置（JSON）",
    "credentials": "凭证（JSON）",
    "components": "组件配置（JSON）",
    "dashboard": "仪表盘配置（JSON）",
    "meta_data": "扩展元数据（JSON）",
    "data": "数据（JSON）",
    "filter": "筛选条件（JSON）",
    "rules": "规则（JSON）",
    "options": "选项（JSON）",
    "fonts": "字体配置",
    "styles": "样式",
    "events": "订阅事件",
    "endpoint": "推送端点",
    "notifications": "通知配置（JSON）",
    "idle": "空闲屏配置（JSON）",
    "sale": "销售屏配置（JSON）",
    "sale_keys": "销售快捷键（JSON）",
    "ticket_information": "价签信息（JSON）",
    "alternate_images": "备用图片（JSON）",
    "surcharging": "附加费配置（JSON）",
    "email_settings": "邮件设置（JSON）",
    "additional_auth": "附加认证信息",
    "field_name": "字段名",
    "old_value": "旧值",
    "new_value": "新值",
    "summary": "变更摘要",
    "action": "操作类型",
    "event": "事件类型",
    "competitor": "竞争对手",
    "source": "来源名称",
    "source_type": "来源类型（PROVIDED/IMPORTED）",
    "price_set_name": "价格组名称",
    "start_date": "生效开始日期",
    "end_date": "生效结束日期",
    "capped_price": "封顶价格",
    "effective_time": "生效时间",
    "price_ex": "不含税价格",
    "cost_ex": "不含税成本",
    "promotion_price": "促销价",
    "reorder_level": "再订货点",
    "reorder_amount": "再订货量",
    "reorder_limit": "再订货上限",
    "reorder_rounding": "再订货取整方式",
    "max_quantity": "最大库存量",
    "on_order": "在途数量",
    "scanned": "是否已扫描",
    "applied": "是否已应用",
    "display_expected": "是否显示预期数量",
    "express": "是否快捷促销",
    "mix_criteria": "是否混合条件",
    "active": "是否启用",
    "enabled": "是否启用",
    "external": "是否外部链接",
    "special": "是否特殊报表",
    "exclude": "是否排除",
    "optional": "是否可选",
    "mixed_only": "是否仅混合",
    "zero_stock": "是否零库存",
    "override_stock": "是否覆盖库存",
    "include_freight": "是否含运费",
    "account_sale": "是否挂账销售",
    "account_receipt": "是否账单小票",
    "allow_marketing_emails": "是否允许营销邮件",
    "allow_account_sales": "是否允许挂账",
    "allow_higher_price": "是否允许高于原价",
    "allow_discounting_promotions": "是否允许促销折扣",
    "allow_order_below_minimum": "是否允许低于最小订货量",
    "auto_print_receipt": "是否自动打印小票",
    "auto_print_parked_receipt": "是否自动打印挂单小票",
    "auto_email_receipt": "是否自动邮件小票",
    "auto_print_payment_receipt": "是否自动打印付款小票",
    "require_order_reference": "是否必填订单参考号",
    "disable_promotions": "是否禁用促销",
    "override_customer_group": "是否覆盖客户组设置",
    "prevent_manual_discounts": "是否禁止手动折扣",
    "request_quantity": "收银时是否询问数量",
    "request_price": "收银时是否询问价格",
    "track_inventory": "是否跟踪库存",
    "use_scales": "是否使用电子秤",
    "use_barcode_templates": "是否使用条码模板",
    "use_price_label": "是否使用价签",
    "cost_percentage": "是否按成本百分比定价",
    "align_family": "是否与系列对齐",
    "temp_product": "是否临时商品",
    "recalculate_quantity": "是否重算数量",
    "always_open_drawer": "是否总是开钱箱",
    "always_print": "是否总是打印",
    "use_rounding": "是否使用抹零",
    "default_pay_exact": "是否默认精确支付",
    "order_automatic_email": "是否自动邮件发送订单",
    "freight_included_on_invoices": "发票是否含运费",
    "has_kitchen_screen": "是否有厨房屏",
    "is_admin": "是否管理员",
    "is_api_user": "是否 API 用户",
    "is_default": "是否默认",
    "pending_password_reset": "是否待重置密码",
    "closed": "是否已关闭",
    "deleted_at": "删除时间（软删除）",
    "created_at": "创建时间",
    "updated_at": "更新时间",
    "sent_at": "发送时间",
    "received_at": "收货时间",
    "cancelled_at": "取消时间",
    "completed_at": "完成时间",
    "opened_at": "开启时间",
    "closed_at": "关闭时间",
    "read_at": "已读时间",
    "uploaded_at": "上传时间",
    "last_sold_at": "最近销售时间",
    "last_stocktaked_at": "最近盘点时间",
    "timestamp": "时间戳",
    "process_time": "处理时间",
    "trial_ends_at": "试用结束时间",
    "expiry": "过期时间",
    "next_due_date": "下次到期日",
    "order_date": "订单日期",
    "due_date": "到期日期",
    "start": "开始时间",
    "end": "结束时间",
    "open_time": "开班时间",
    "business_type": "业务类型",
    "dark_mode": "深色模式",
    "scope_type": "作用域类型（vendor/outlet/register/user）",
    "scope_id": "作用域 ID",
    "value": "设置值",
    "datatype": "数据类型",
    "contact_name": "联系人姓名",
    "default_tax_rate_id": "默认税率 ID",
    "address_street1": "地址行 1",
    "address_street2": "地址行 2",
    "address_suburb": "地址区/街道",
    "address_city": "城市",
    "address_postcode": "邮编",
    "address_region": "省/州",
    "address_country": "国家",
    "logo": "Logo URL",
    "background_colour": "背景色",
    "text_colour": "文字颜色",
    "main_colour": "主色调",
    "gateway_url": "支付网关 URL",
    "cashout_method_id": "找零方式 ID",
    "receipt": "小票内容",
    "receipt_width": "小票宽度",
    "classification_type": "分类类型",
    "item_id": "关联条目 ID",
    "item_type": "条目类型",
    "rule": "定价规则",
    "credit_terms": "账期条款",
    "default_order_tax": "默认订单税类型",
    "email_format": "邮件格式",
    "distribute_fees": "费用分摊方式",
    "distribute_freight": "运费分摊方式",
    "minimum_order_value": "最小订货金额",
    "maximum_order_value": "最大订货金额",
    "minimum_order_quantity": "最小订货量",
    "default_days_until_due": "默认账期天数",
    "freight_fixed_cost_per_case": "每箱固定运费",
    "supplier_code": "供应商商品编码",
    "recurring_period": "重复周期",
    "notifiable_type": "通知对象类型",
    "notifiable_id": "通知对象 ID",
    "ipv4": "IPv4 地址",
    "ipv6": "IPv6 地址",
    "user_agent": "用户代理",
    "safe_name": "安全名称",
    "section": "权限分组",
    "managed_id": "托管角色 ID",
    "item_type_trash": "条目类型",  # trashed_item uses item_type
    "width": "宽度",
    "height": "高度",
    "page_width": "页面宽度",
    "page_height": "页面高度",
    "page_margin": "页边距",
    "horizontal_panels": "水平面板数",
    "vertical_panels": "垂直面板数",
    "horizontal_panel_spacing": "水平面板间距",
    "vertical_panel_spacing": "垂直面板间距",
    "cutting_width": "裁切宽度",
    "transformation_script": "转换脚本",
    "fields_tracked": "跟踪字段",
    "sale_max_application_count": "单笔销售最大应用次数",
    "buy_amount": "购买数量/金额",
    "buy_amount_max": "购买数量/金额上限",
    "buy_amount_type": "购买计量类型",
    "discount_amount_crit": "折扣量",  # promotion_criteria
    "min_quantity": "最小数量",
    "quantity_type": "数量类型",
    "line_count": "行数",
    "entered_as": "录入税类型",
    "original_amount": "原始金额",
    "current_amount": "当前余额",
    "show_on_order": "是否在订单中显示",
    "include_in_integrations": "是否纳入集成",
    "subtype": "支付子类型",
    "refund_reason": "退款原因",
    "savings": "节省金额",
    "tax": "税额",
    "local_id": "本地 ID",
    "host_id": "主机端 ID",
    "related_order_id": "关联订单 ID",
    "payment_id": "付款 ID",
    "closure_id": "日结 ID",
    "register_id": "收银机 ID",
    "customer_id": "客户 ID",
    "product_id": "商品 ID",
    "supplier_id": "供应商 ID",
    "outlet_id": "门店 ID",
    "user_id": "用户 ID",
    "role_id": "角色 ID",
    "sale_id": "销售单 ID",
    "order_id": "订单 ID",
    "stocktake_id": "盘点 ID",
    "gift_card_id": "礼品卡 ID",
    "promotion_id": "促销 ID",
    "price_list_id": "价目表 ID",
    "price_set_id": "价格组 ID",
    "payment_method_id": "支付方式 ID",
    "customer_group_id": "客户组 ID",
    "tax_rate_id": "税率 ID",
    "category_id": "分类 ID",
    "brand_id": "品牌 ID",
    "family_id": "产品系列 ID",
    "tag_id": "标签 ID",
    "contact_id": "联系信息 ID",
    "template_id": "模板 ID",
    "barcode_template_id": "条码模板 ID",
    "ticket_template_id": "价签模板 ID",
    "permission_id": "权限 ID",
    "host_connection_id": "主机连接 ID",
    "integration_id": "集成 ID",
    "promotion_category_id": "促销分类 ID",
    "billing_contact_id": "账单地址 ID",
    "delivery_contact_id": "配送地址 ID",
    "core_supplier_id": "核心供应商 ID",
    "cost_tax_rate_id": "成本税率 ID",
    "default_receipt_id": "默认小票模板 ID",
    "email_receipt_id": "邮件小票模板 ID",
    "payment_receipt_id": "付款小票模板 ID",
    "statement_template_id": "对账单模板 ID",
    "ticketing_price_set_id": "价签价格组 ID",
    "parent_id": "父级 ID",
    "from_id": "来源 ID（供应商/门店）",
    "to_id": "目标 ID（门店/调拨方）",
    "created_by_id": "创建人 ID",
    "sent_by_id": "发送人 ID",
    "received_by_id": "收货人 ID",
    "completed_by_id": "完成人 ID",
    "merged_into_id": "合并至订单 ID",
    "linked_sale_id": "关联销售单 ID",
    "relates_to_id": "关联记录 ID",
    "customer_payment_id": "客户付款 ID",
    "on_order_id": "在途订单 ID",
    "completed_id": "完成记录 ID",
    "owner_id": "所有者 ID",
    "notifiable_id_col": "通知对象 ID",
}

# Per-table column overrides
TABLE_COLUMN_ZH = {
    ("trashed_item", "item_type"): "回收条目类型（PRODUCT/CUSTOMER/SUPPLIER 等）",
    ("trashed_item", "item_id"): "被删除条目 ID",
    ("trashed_item", "name"): "条目名称",
    ("buying_period", "start"): "周期开始时间",
    ("buying_period", "end"): "周期结束时间",
    ("promotion", "start"): "促销开始时间",
    ("promotion", "end"): "促销结束时间",
    ("promotion_criteria", "type"): "促销类型",
    ("promotion_criteria", "discount_amount"): "折扣量",
    ("purchase_order", "type"): "订单类型（ORDER/TRANSFER/CREDIT 等）",
    ("purchase_order", "status"): "订单状态",
    ("purchase_order", "from_id"): "来源 ID（供应商或门店）",
    ("purchase_order", "to_id"): "目标 ID（门店或调拨方）",
    ("sale", "status"): "销售状态（COMPLETED/VOIDED/PARKED 等）",
    ("sale", "discount_amount"): "折扣（金额或百分比）",
    ("sale_item", "discount_amount"): "行折扣（金额或百分比）",
    ("customer_payment", "status"): "付款状态",
    ("sale_payment", "status"): "支付状态",
    ("gift_card", "status"): "礼品卡状态",
    ("gift_card_movement", "action"): "流水类型（SOLD/REDEEMED）",
    ("stocktake", "type"): "盘点类型",
    ("stocktake", "status"): "盘点状态",
    ("supplier", "status"): "供应商状态",
    ("product", "type"): "商品类型",
    ("product", "status"): "商品状态（ACTIVE/INACTIVE 等）",
    ("external_stocktake", "status"): "外部盘点状态",
    ("host_connection", "type"): "主机连接类型",
    ("mail_log", "status"): "邮件状态（DELIVERED/BOUNCED/PENDING）",
    ("payment_method", "type"): "支付方式类型",
    ("receipt", "type"): "小票类型",
    ("register", "invoice_number"): "当前发票号",
    ("settings", "name"): "设置项名称",
    ("tax_rate", "amount"): "税率百分比（如 10.0000 表示 10%）",
    ("customer_revision", "id"): "变更记录 ID",
    ("customer_revision", "action"): "变更操作",
    ("notification", "id"): "通知 UUID",
    ("product_supplier", "code"): "供应商商品编码（SKU）",
    ("product_supplier", "minimum_order_quantity"): "该供应商最小订货量",
    ("product_barcode", "code"): "条码",
    ("product", "image"): "商品图片 URL",
    ("outlet", "logo"): "门店 Logo URL",
    ("product_price", "quantity"): "价格对应数量",
    ("product_inventory", "quantity"): "库存数量",
    ("price_list_item", "item_id"): "商品/品牌/分类/系列/标签 ID",
    ("price_list_item", "amount"): "规则金额/百分比",
    ("vendor_connection", "customer_id"): "关联客户 ID",
    ("app_user", "name"): "显示名称",
    ("app_user", "password_hash"): "密码哈希（BCrypt，禁止明文存储）",
    ("supplier_authentication", "password_hash"): "密码哈希（BCrypt，禁止明文存储）",
    ("supplier_authentication", "account_number"): "供应商账号",
    ("supplier_authentication", "username"): "供应商登录用户名",
    ("quick_menu_item", "url"): "链接地址",
    ("quick_menu_item", "name"): "菜单名称",
    ("report", "type"): "报表类型",
    ("report", "name"): "报表名称",
    ("host_change", "type"): "变更类型",
    ("host_change", "status"): "变更状态",
    ("host_identifier", "type"): "标识类型",
    ("order_review", "status"): "审核状态",
    ("customer_payment_allocation", "amount"): "分配金额",
    ("register_closure_payment", "expected"): "预期金额",
    ("register_closure_payment", "received"): "实收金额",
}


def parse_tables(sql_text: str) -> dict[str, list[tuple[str, str]]]:
    tables: dict[str, list[tuple[str, str]]] = {}
    for m in re.finditer(r"CREATE TABLE `(\w+)`\s*\((.*?)\)\s*ENGINE", sql_text, re.S):
        tname = m.group(1)
        body = m.group(2)
        cols: list[tuple[str, str]] = []
        for line in body.split("\n"):
            line = line.strip().rstrip(",")
            if not line.startswith("`"):
                continue
            if line.startswith(("PRIMARY", "UNIQUE", "INDEX", "CONSTRAINT", "KEY")):
                continue
            cm = re.match(r"`(\w+)`\s+(.+)", line)
            if cm:
                cols.append((cm.group(1), cm.group(2)))
        tables[tname] = cols
    return tables


def fk_comment(col: str) -> str | None:
    if not col.endswith("_id"):
        return None
    if col == "id":
        return None
    base = col[:-3]
    if base in FK_ZH:
        zh = FK_ZH[base]
        table = base if base not in ("user", "order", "payment", "template", "item", "owner", "closure", "host", "local", "from", "to", "completed", "notifiable", "related_order", "linked_sale", "merged_into", "relates_to", "on_order", "sent_by", "received_by", "created_by", "completed_by", "cashout_method", "core_supplier", "cost_tax_rate", "default_tax_rate", "freight_tax", "fees_tax", "ticketing_price_set") else base
        if base == "user":
            table = "app_user"
        elif base == "order":
            table = "purchase_order"
        elif base == "payment":
            table = "customer_payment"
        elif base == "template":
            table = "barcode_template"
        elif base == "closure":
            table = "register_closure"
        elif base == "owner":
            table = "app_user"
        elif base == "completed":
            table = "external_stocktake"
        elif base == "notifiable":
            return f"{zh} ID"
        elif base in ("from", "to"):
            return COLUMN_ZH.get(col, f"{zh} ID")
        return f"{zh} ID，关联 {table}.id"
    return None


def column_comment(table: str, col: str) -> str:
    key = (table, col)
    if key in TABLE_COLUMN_ZH:
        return TABLE_COLUMN_ZH[key]
    if col in COLUMN_ZH:
        return COLUMN_ZH[col]
    fk = fk_comment(col)
    if fk:
        return fk
    # snake_case fallback: humanize
    parts = col.split("_")
    if parts[-1] == "at" and len(parts) >= 2:
        action = "_".join(parts[:-1])
        action_map = {
            "create": "创建时间",
            "update": "更新时间",
            "delete": "删除时间",
            "read": "已读时间",
            "send": "发送时间",
            "receive": "收货时间",
            "cancel": "取消时间",
            "complete": "完成时间",
            "open": "开启时间",
            "close": "关闭时间",
            "upload": "上传时间",
        }
        if action in action_map:
            return action_map[action]
    return col.replace("_", " ")


def strip_existing_comment(defn: str) -> str:
    return re.sub(r"\s+COMMENT\s+'(?:[^'\\]|\\.)*'", "", defn, flags=re.I)


def add_comment_to_line(line: str, comment: str) -> str:
    stripped = line.rstrip()
    comma = "," if stripped.endswith(",") else ""
    core = strip_existing_comment(stripped.rstrip(",").strip())
    escaped = comment.replace("'", "''")
    return f"{core} COMMENT '{escaped}'{comma}"


def to_alter_column(table: str, col: str, defn: str, comment: str) -> str:
    defn_clean = strip_existing_comment(defn)
    escaped = comment.replace("'", "''")
    return f"ALTER TABLE `{table}` MODIFY COLUMN `{col}` {defn_clean} COMMENT '{escaped}';"


def main() -> None:
    sql_text = ORITHOS_SQL.read_text(encoding="utf-8")
    tables = parse_tables(sql_text)

    alter_lines = [
        "-- Orithos 全库字段中文注释",
        "-- 由 scripts/generate_column_comments.py 自动生成",
        "SET NAMES utf8mb4;",
        "",
    ]

    new_sql = sql_text
    total = 0
    for table in sorted(tables.keys()):
        cols = tables[table]
        table_zh = TABLE_ZH.get(table, table)
        alter_lines.append(f"-- {table}（{table_zh}）")
        for col, defn in cols:
            comment = column_comment(table, col)
            alter_lines.append(to_alter_column(table, col, defn, comment))
            total += 1
        alter_lines.append("")

    # Update CREATE TABLE column lines in orithos.sql
    def replace_create(match: re.Match) -> str:
        tname = match.group(1)
        body = match.group(2)
        rest = match.group(3)
        new_body_lines = []
        for line in body.split("\n"):
            cm = re.match(r"\s*`(\w+)`\s+.+", line)
            if cm:
                col = cm.group(1)
                comment = column_comment(tname, col)
                new_body_lines.append(add_comment_to_line(line, comment))
            else:
                new_body_lines.append(line)
        return f"CREATE TABLE `{tname}`  (\n" + "\n".join(new_body_lines) + f"\n) {rest}"

    new_sql = re.sub(
        r"CREATE TABLE `(\w+)`\s*\((.*?)\)\s*(ENGINE\s*=.+?;)",
        replace_create,
        sql_text,
        flags=re.S,
    )

    OUTPUT_SQL.write_text("\n".join(alter_lines), encoding="utf-8")
    ORITHOS_SQL.write_text(new_sql, encoding="utf-8")

    print(f"Generated {OUTPUT_SQL} ({total} columns across {len(tables)} tables)")
    print(f"Updated {ORITHOS_SQL}")


if __name__ == "__main__":
    main()
