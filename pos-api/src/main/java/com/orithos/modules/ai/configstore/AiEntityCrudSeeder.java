package com.orithos.modules.ai.configstore;

/**
 * Idempotent seed for Inventory/Customer entity CRUD AI config.
 */
final class AiEntityCrudSeeder {

    private AiEntityCrudSeeder() {}

    static void ensure(AiIntentMapper intentMapper,
                       AiSlotMapper slotMapper,
                       AiSlotValueMapper slotValueMapper) {
        ensureIntent(intentMapper);
        ensureGuidedIntent(intentMapper);
        ensureSlot(slotMapper, "entity", "Business entity",
                "Inventory/Customer entity for read-only lookup", "enum", 64, 70);
        ensureSlot(slotMapper, "op", "Entity operation",
                "Read-only list|search|view; legacy write values are normalized to guided_action", "enum", 32, 80);

        // routes
        ensureValue(slotValueMapper, "route", "products_merge", "/products/merge", "Merge products", 31);
        ensureValue(slotValueMapper, "route", "classifications", "/classifications", "Classifications", 32);
        ensureValue(slotValueMapper, "route", "suppliers", "/suppliers", "Suppliers", 33);
        ensureValue(slotValueMapper, "route", "suppliers_new", "/suppliers/new", "New supplier", 34);
        ensureValue(slotValueMapper, "route", "orders_new", "/orders/new", "New order", 51);
        ensureValue(slotValueMapper, "route", "orders_transfer", "/orders/transfer/new", "New transfer", 52);
        ensureValue(slotValueMapper, "route", "orders_receive", "/orders/receive/new", "New receive", 53);
        ensureValue(slotValueMapper, "route", "orders_return", "/orders/return/new", "New return", 54);
        ensureValue(slotValueMapper, "route", "orders_credit", "/orders/credit/new", "New credit", 55);
        ensureValue(slotValueMapper, "route", "stocktake_express", "/stocktake/express", "Express stocktake", 61);
        ensureValue(slotValueMapper, "route", "stock_more", "/stock/more", "Stock more", 62);
        ensureValue(slotValueMapper, "route", "stock_list", "/stock/list", "Stock list", 63);
        ensureValue(slotValueMapper, "route", "stock_external", "/stock/external-stocktake", "External stocktake", 64);
        ensureValue(slotValueMapper, "route", "stock_capped", "/stock/capped-pricing", "Capped pricing", 65);
        ensureValue(slotValueMapper, "route", "stock_bulk_price", "/stock/bulk-price-edit", "Bulk price edit", 66);
        ensureValue(slotValueMapper, "route", "stock_import_sup", "/stock/import-supplier-products", "Import supplier products", 67);
        ensureValue(slotValueMapper, "route", "stock_buying", "/stock/buying-periods", "Buying periods", 68);
        ensureValue(slotValueMapper, "route", "replenishment", "/stock/replenishment", "Replenishment", 69);
        ensureValue(slotValueMapper, "route", "capped_pricing_ai", "/stock/capped-pricing", "AI price review", 70);
        ensureValue(slotValueMapper, "route", "sommelier", "/sommelier", "Wine recommendations", 71);
        ensureValue(slotValueMapper, "route", "invoice_scan", "/invoices/scan", "Invoice capture", 72);
        ensureValue(slotValueMapper, "route", "products_new", "/products/new", "New product", 30);
        ensureValue(slotValueMapper, "route", "customers_new", "/customers/new", "New customer", 81);
        ensureValue(slotValueMapper, "route", "customers_merge", "/customers/merge", "Merge customers", 82);
        ensureValue(slotValueMapper, "route", "customer_groups", "/customer-groups", "Customer groups", 83);
        ensureValue(slotValueMapper, "route", "pricelists", "/pricelists", "Price lists", 84);
        ensureValue(slotValueMapper, "route", "balances", "/customers/balances", "Balances", 85);
        ensureValue(slotValueMapper, "route", "statements", "/customers/balances/statements", "Statements", 86);
        ensureValue(slotValueMapper, "route", "giftcards_import", "/giftcards/import", "Import gift cards", 91);

        // entities
        ensureValue(slotValueMapper, "entity", "product", "product", "Product", 10);
        ensureValue(slotValueMapper, "entity", "classification", "classification", "Classification", 20);
        ensureValue(slotValueMapper, "entity", "supplier", "supplier", "Supplier", 30);
        ensureValue(slotValueMapper, "entity", "order", "order", "Order / Invoice", 40);
        ensureValue(slotValueMapper, "entity", "stocktake", "stocktake", "Stocktake", 50);
        ensureValue(slotValueMapper, "entity", "stock_list", "stock_list", "Stock list", 60);
        ensureValue(slotValueMapper, "entity", "stock_more", "stock_more", "Stock more hub", 70);
        ensureValue(slotValueMapper, "entity", "customer", "customer", "Customer", 80);
        ensureValue(slotValueMapper, "entity", "user", "customer", "User alias → customer", 81);
        ensureValue(slotValueMapper, "entity", "用户", "customer", "用户 → customer", 82);
        ensureValue(slotValueMapper, "entity", "客户", "customer", "客户 → customer", 83);
        ensureValue(slotValueMapper, "entity", "customer_group", "customer_group", "Customer group", 90);
        ensureValue(slotValueMapper, "entity", "price_list", "price_list", "Price list", 100);
        ensureValue(slotValueMapper, "entity", "balance", "balance", "Customer balance", 110);
        ensureValue(slotValueMapper, "entity", "gift_card", "gift_card", "Gift card", 120);
        ensureValue(slotValueMapper, "entity", "buying_period", "buying_period", "Buying period", 130);
        ensureValue(slotValueMapper, "entity", "capped_pricing", "capped_pricing", "Capped pricing", 140);
        ensureValue(slotValueMapper, "entity", "bulk_price_edit", "bulk_price_edit", "Bulk price edit", 150);

        // ops
        ensureValue(slotValueMapper, "op", "list", "list", "List / open page", 10);
        ensureValue(slotValueMapper, "op", "search", "search", "Search", 20);
        ensureValue(slotValueMapper, "op", "create", "create", "Create", 30);
        ensureValue(slotValueMapper, "op", "view", "view", "View", 40);
        ensureValue(slotValueMapper, "op", "edit", "edit", "Edit / update", 50);
        ensureValue(slotValueMapper, "op", "delete", "delete", "Delete", 60);
        ensureValue(slotValueMapper, "op", "merge", "merge", "Merge", 70);
        ensureValue(slotValueMapper, "op", "import", "import", "Import", 80);
        ensureValue(slotValueMapper, "op", "export", "export", "Export", 90);

        // CRUD trigger keywords
        ensureValue(slotValueMapper, IntentConfigService.SLOT_AI_TRIGGER, "delete", "delete", "delete", 190);
        ensureValue(slotValueMapper, IntentConfigService.SLOT_AI_TRIGGER, "create", "create", "create", 200);
        ensureValue(slotValueMapper, IntentConfigService.SLOT_AI_TRIGGER, "add", "add", "add", 210);
        ensureValue(slotValueMapper, IntentConfigService.SLOT_AI_TRIGGER, "edit", "edit", "edit", 220);
        ensureValue(slotValueMapper, IntentConfigService.SLOT_AI_TRIGGER, "update", "update", "update", 230);
        ensureValue(slotValueMapper, IntentConfigService.SLOT_AI_TRIGGER, "remove", "remove", "remove", 240);
        ensureValue(slotValueMapper, IntentConfigService.SLOT_AI_TRIGGER, "merge", "merge", "merge", 250);
        ensureValue(slotValueMapper, IntentConfigService.SLOT_AI_TRIGGER, "import", "import", "import", 260);
        ensureValue(slotValueMapper, IntentConfigService.SLOT_AI_TRIGGER, "export", "export", "export", 270);
        ensureValue(slotValueMapper, IntentConfigService.SLOT_AI_TRIGGER, "shanchu", "删除", "删除", 280);
        ensureValue(slotValueMapper, IntentConfigService.SLOT_AI_TRIGGER, "xinjian", "新建", "新建", 290);
        ensureValue(slotValueMapper, IntentConfigService.SLOT_AI_TRIGGER, "chuangjian", "创建", "创建", 295);
        ensureValue(slotValueMapper, IntentConfigService.SLOT_AI_TRIGGER, "xinzeng", "新增", "新增", 298);
        ensureValue(slotValueMapper, IntentConfigService.SLOT_AI_TRIGGER, "tianjia", "添加", "添加", 300);
        ensureValue(slotValueMapper, IntentConfigService.SLOT_AI_TRIGGER, "xiugai", "修改", "修改", 310);
        ensureValue(slotValueMapper, IntentConfigService.SLOT_AI_TRIGGER, "bianji", "编辑", "编辑", 320);
        ensureValue(slotValueMapper, IntentConfigService.SLOT_AI_TRIGGER, "hebing", "合并", "合并", 330);
    }

    private static void ensureIntent(AiIntentMapper intentMapper) {
        final String hint =
                "User wants to inspect a supported Inventory, Customer, Supplier, Order, Stocktake, Classification, Customer group, Price list, Gift card, Buying period, Stock list, Balance or pricing entity. Extract entity + op + query. Map user/用户 to entity customer. Use entity_action only for list/search/view. Any create, edit, delete, import, merge, receive, save, confirm, price change or inventory adjustment must use guided_action with a page route; the assistant never writes business data.";
        AiIntent existing = intentMapper.findByCode("entity_action");
        if (existing != null) {
            if (existing.getPromptHint() == null || !existing.getPromptHint().contains("entity_action only for list/search/view")) {
                existing.setPromptHint(hint);
            }
            existing.setName("Entity lookup");
            existing.setDescription("Read-only entity lookup: list/search/view");
            intentMapper.update(existing);
            return;
        }
        AiIntent i = new AiIntent();
        i.setCode("entity_action");
        i.setName("Entity lookup");
        i.setDescription("Read-only entity lookup: list/search/view");
        i.setPromptHint(hint);
        i.setDefaultPanel("dialogue");
        i.setEnabled(true);
        i.setSortOrder(45);
        intentMapper.insert(i);
    }

    private static void ensureGuidedIntent(AiIntentMapper intentMapper) {
        if (intentMapper.findByCode("guided_action") != null) return;
        AiIntent i = new AiIntent();
        i.setCode("guided_action");
        i.setName("Guided action");
        i.setDescription("Explain a business change and open its confirmation page");
        i.setPromptHint("Use for every business write or mutation. Explain required information and risk, return a page route, and never execute or emit writeRequests.");
        i.setDefaultPanel("dialogue");
        i.setEnabled(true);
        i.setSortOrder(46);
        intentMapper.insert(i);
    }

    private static void ensureSlot(AiSlotMapper slotMapper, String code, String name, String desc,
                                   String type, int max, int order) {
        AiSlot existing = slotMapper.findByCode(code);
        if (existing != null) {
            if ("entity".equals(code) || "op".equals(code)) {
                existing.setName(name);
                existing.setDescription(desc);
                slotMapper.update(existing);
            }
            return;
        }
        AiSlot s = new AiSlot();
        s.setCode(code);
        s.setName(name);
        s.setDescription(desc);
        s.setValueType(type);
        s.setMaxLength(max);
        s.setEnabled(true);
        s.setSortOrder(order);
        slotMapper.insert(s);
    }

    private static void ensureValue(AiSlotValueMapper mapper, String slot, String key, String value,
                                    String label, int order) {
        if (mapper.findBySlotAndKey(slot, key) != null) return;
        AiSlotValue v = new AiSlotValue();
        v.setSlotCode(slot);
        v.setValueKey(key);
        v.setValue(value);
        v.setLabel(label);
        v.setEnabled(true);
        v.setSortOrder(order);
        mapper.insert(v);
    }
}
