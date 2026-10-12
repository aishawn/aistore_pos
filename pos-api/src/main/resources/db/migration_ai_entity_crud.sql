-- Expand AI for Inventory + Customer menu CRUD (safe to re-run).
-- Also covered by AiConfigInitializer.ensureEntityCrudConfig() on API startup.

SET NAMES utf8mb4;

INSERT IGNORE INTO `ai_intent`
  (`code`, `name`, `description`, `prompt_hint`, `default_panel`, `default_view`, `enabled`, `sort_order`)
VALUES
('entity_action', 'Entity CRUD',
 'Inventory/Customer menu CRUD: list/search/create/view/edit/delete',
 'User wants to manage Inventory or Customer menu entities. Extract entity + op + query. Destructive ops confirmed on client.',
 'dialogue', NULL, 1, 45);

INSERT IGNORE INTO `ai_slot`
  (`code`, `name`, `description`, `value_type`, `max_length`, `enabled`, `sort_order`)
VALUES
('entity', 'Business entity', 'Inventory/Customer entity for CRUD', 'enum', 64, 1, 70),
('op', 'CRUD operation', 'list|search|create|view|edit|delete|merge|import|export', 'enum', 32, 1, 80);

INSERT IGNORE INTO `ai_slot_value`
  (`slot_code`, `value_key`, `value`, `label`, `enabled`, `sort_order`)
VALUES
('route', 'products_merge',    '/products/merge',                  'Merge products',          1, 31),
('route', 'classifications',   '/classifications',                 'Classifications',         1, 32),
('route', 'suppliers',         '/suppliers',                       'Suppliers',               1, 33),
('route', 'suppliers_new',     '/suppliers/new',                   'New supplier',            1, 34),
('route', 'orders_new',        '/orders/new',                      'New order',               1, 51),
('route', 'orders_transfer',   '/orders/transfer/new',             'New transfer',            1, 52),
('route', 'orders_receive',    '/orders/receive/new',              'New receive',             1, 53),
('route', 'orders_return',     '/orders/return/new',               'New return',              1, 54),
('route', 'orders_credit',     '/orders/credit/new',               'New credit',              1, 55),
('route', 'stocktake_express', '/stocktake/express',               'Express stocktake',       1, 61),
('route', 'stock_more',        '/stock/more',                      'Stock more',              1, 62),
('route', 'stock_list',        '/stock/list',                      'Stock list',              1, 63),
('route', 'stock_external',    '/stock/external-stocktake',        'External stocktake',      1, 64),
('route', 'stock_capped',      '/stock/capped-pricing',            'Capped pricing',          1, 65),
('route', 'stock_bulk_price',  '/stock/bulk-price-edit',           'Bulk price edit',         1, 66),
('route', 'stock_import_sup',  '/stock/import-supplier-products',  'Import supplier products',1, 67),
('route', 'stock_buying',      '/stock/buying-periods',            'Buying periods',          1, 68),
('route', 'customers_new',     '/customers/new',                   'New customer',            1, 81),
('route', 'customers_merge',   '/customers/merge',                 'Merge customers',         1, 82),
('route', 'customer_groups',   '/customer-groups',                 'Customer groups',         1, 83),
('route', 'pricelists',        '/pricelists',                      'Price lists',             1, 84),
('route', 'balances',          '/customers/balances',              'Balances',                1, 85),
('route', 'statements',        '/customers/balances/statements',   'Statements',              1, 86),
('route', 'giftcards_import',  '/giftcards/import',                'Import gift cards',       1, 91),
('entity', 'product',          'product',          'Product',            1, 10),
('entity', 'classification',   'classification',   'Classification',     1, 20),
('entity', 'supplier',         'supplier',         'Supplier',           1, 30),
('entity', 'order',            'order',            'Order / Invoice',    1, 40),
('entity', 'stocktake',        'stocktake',        'Stocktake',          1, 50),
('entity', 'stock_list',       'stock_list',       'Stock list',         1, 60),
('entity', 'stock_more',       'stock_more',       'Stock more hub',     1, 70),
('entity', 'customer',         'customer',         'Customer',           1, 80),
('entity', 'customer_group',   'customer_group',   'Customer group',     1, 90),
('entity', 'price_list',       'price_list',       'Price list',         1, 100),
('entity', 'balance',          'balance',          'Customer balance',   1, 110),
('entity', 'gift_card',        'gift_card',        'Gift card',          1, 120),
('entity', 'buying_period',    'buying_period',    'Buying period',      1, 130),
('entity', 'capped_pricing',   'capped_pricing',   'Capped pricing',     1, 140),
('entity', 'bulk_price_edit',  'bulk_price_edit',  'Bulk price edit',    1, 150),
('op', 'list',   'list',   'List / open page', 1, 10),
('op', 'search', 'search', 'Search',           1, 20),
('op', 'create', 'create', 'Create',           1, 30),
('op', 'view',   'view',   'View',             1, 40),
('op', 'edit',   'edit',   'Edit / update',    1, 50),
('op', 'delete', 'delete', 'Delete',           1, 60),
('op', 'merge',  'merge',  'Merge',            1, 70),
('op', 'import', 'import', 'Import',           1, 80),
('op', 'export', 'export', 'Export',           1, 90),
('ai_trigger', 'delete',  'delete', 'delete', 1, 190),
('ai_trigger', 'create',  'create', 'create', 1, 200),
('ai_trigger', 'add',     'add',    'add',    1, 210),
('ai_trigger', 'edit',    'edit',   'edit',   1, 220),
('ai_trigger', 'update',  'update', 'update', 1, 230),
('ai_trigger', 'remove',  'remove', 'remove', 1, 240),
('ai_trigger', 'merge',   'merge',  'merge',  1, 250),
('ai_trigger', 'import',  'import', 'import', 1, 260),
('ai_trigger', 'export',  'export', 'export', 1, 270),
('ai_trigger', 'shanchu', '删除',   '删除',   1, 280),
('ai_trigger', 'xinjian', '新建',   '新建',   1, 290),
('ai_trigger', 'chuangjian', '创建', '创建', 1, 295),
('ai_trigger', 'xinzeng', '新增',   '新增',   1, 298),
('ai_trigger', 'tianjia', '添加',   '添加',   1, 300),
('ai_trigger', 'xiugai',  '修改',   '修改',   1, 310),
('ai_trigger', 'bianji',  '编辑',   '编辑',   1, 320),
('ai_trigger', 'hebing',  '合并',   '合并',   1, 330);
