package com.orithos.modules.ai;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WorkflowRouteRouterTest {

    @Test
    void routesExplicitWorkflowRequestsWithoutDependingOnModelIntent() {
        assertRoute("Show me the suppliers", "/suppliers/odoo");
        assertRoute("Search supplier directory", "/suppliers/odoo");
        assertRoute("查看供应商列表", "/suppliers/odoo");
        assertRoute("Open orders", "/orders");
        assertRoute("Show me purchase orders", "/orders");
        assertRoute("查看采购订单", "/orders");
        assertRoute("Go to stocktake", "/stocktake");
        assertRoute("Open inventory count", "/stocktake");
        assertRoute("去盘点", "/stocktake");
        assertRoute("Show me classifications", "/classifications");
        assertRoute("查看分类列表", "/classifications");
        assertRoute("List customer groups", "/customer-groups");
        assertRoute("查看客户分组", "/customer-groups");
        assertRoute("Search price lists", "/pricelists");
        assertRoute("查看价目表", "/pricelists");
        assertRoute("Show me gift cards", "/giftcards");
        assertRoute("查看礼品卡列表", "/giftcards");
        assertRoute("Stock?", "/stock/list");
        assertRoute("What's in stock?", "/stock/list");
        assertRoute("How's our stock looking?", "/stock/list");
        assertRoute("库存情况怎么样？", "/stock/list");
        assertRoute("Open buying periods", "/stock/buying-periods");
        assertRoute("查看采购周期", "/stock/buying-periods");
        assertRoute("Show customer balances", "/customers/balances");
        assertRoute("查看客户余额", "/customers/balances");
        assertRoute("Open bulk price editing", "/stock/bulk-price-edit");
        assertRoute("查看批量改价", "/stock/bulk-price-edit");
        assertRoute("What should I reorder today?", "/stock/replenishment");
        assertRoute("What should I restock?", "/stock/replenishment");
        assertRoute("What should I purchase?", "/stock/replenishment");
        assertRoute("What should I top up?", "/stock/replenishment");
        assertRoute("What needs a reorder?", "/stock/replenishment");
        assertRoute("帮我看下哪些要补货", "/stock/replenishment");
        assertRoute("What do we need to buy?", "/stock/replenishment");
        assertRoute("我应该买什么？", "/stock/replenishment");
        assertRoute("Restock list please", "/stock/replenishment");
        assertRoute("What should I order for the weekend?", "/stock/replenishment");
        assertRoute("What do I need to order?", "/stock/replenishment");
        assertRoute("Show me the replenishment list", "/stock/replenishment");
        assertRoute("Help me restock", "/stock/replenishment");
        assertRoute("What needs ordering?", "/stock/replenishment");
        assertRoute("Show me low-stock items", "/stock/replenishment");
        assertRoute("Which items are low on stock?", "/stock/replenishment");
        assertRoute("What is low on stock?", "/stock/replenishment");
        assertRoute("What's running low?", "/stock/replenishment");
        assertRoute("Which items need restocking?", "/stock/replenishment");
        assertRoute("哪些商品库存不足", "/stock/replenishment");
        assertRoute("What should we buy before the weekend?", "/stock/replenishment");
        assertRoute("Which products need reordering?", "/stock/replenishment");
        assertRoute("Which products should we buy?", "/stock/replenishment");
        assertRoute("Show me items to order", "/stock/replenishment");
        assertRoute("哪些商品库存低", "/stock/replenishment");
        assertRoute("哪些商品该买", "/stock/replenishment");
        assertRoute("哪些商品快没货", "/stock/replenishment");
        assertRoute("补货清单", "/stock/replenishment");
        assertRoute("Show me the suggested purchase lines", "/stock/replenishment");
        assertRoute("库存预警有哪些", "/stock/replenishment");
        assertRoute("帮我看看哪些商品需要调价", "/stock/capped-pricing");
        assertRoute("Can you review prices for me?", "/stock/capped-pricing");
        assertRoute("What should I charge for Shiraz?", "/stock/capped-pricing");
        assertRoute("How much should I charge for Shiraz?", "/stock/capped-pricing");
        assertRoute("Which products should I reprice?", "/stock/capped-pricing");
        assertRoute("Show me the price suggestions", "/stock/capped-pricing");
        assertRoute("给我看看价格建议", "/stock/capped-pricing");
        assertRoute("Which items need a price review?", "/stock/capped-pricing");
        assertRoute("Which prices need checking?", "/stock/capped-pricing");
        assertRoute("哪些价格需要复核", "/stock/capped-pricing");
        assertRoute("What should I price Shiraz at?", "/stock/capped-pricing");
        assertRoute("What price should I set for Shiraz?", "/stock/capped-pricing");
        assertRoute("What is a fair price for Shiraz?", "/stock/capped-pricing");
        assertRoute("Which prices look off?", "/stock/capped-pricing");
        assertRoute("Should I raise the Shiraz price?", "/stock/capped-pricing");
        assertRoute("Which prices need attention?", "/stock/capped-pricing");
        assertRoute("Suggest a price for Shiraz", "/stock/capped-pricing");
        assertRoute("哪些商品价格不对", "/stock/capped-pricing");
        assertRoute("Recommend a red wine under $30", "/sommelier");
        assertRoute("Something light under 25 dollars", "/sommelier");
        assertRoute("聚会想要清爽一点的酒", "/sommelier");
        assertRoute("Suggest a wine for dinner", "/sommelier");
        assertRoute("Recommend wine for steak", "/sommelier");
        assertRoute("Suggest white wine for a party", "/sommelier");
        assertRoute("Find me a wine for steak", "/sommelier");
        assertRoute("Red wine for steak", "/sommelier");
        assertRoute("What wine goes with steak?", "/sommelier");
        assertRoute("Pair a wine with lamb", "/sommelier");
        assertRoute("Recommend something for steak", "/sommelier");
        assertRoute("Recommend something in stock for steak", "/sommelier");
        assertRoute("Suggest something for steak", "/sommelier");
        assertRoute("Can you suggest something in stock for steak?", "/sommelier");
        assertRoute("What should I serve with lamb?", "/sommelier");
        assertRoute("牛排配什么酒", "/sommelier");
        assertRoute("红酒配牛排", "/sommelier");
        assertRoute("晚餐喝什么酒", "/sommelier");
        assertRoute("Recommend beer for a BBQ under $20", "/recommend/grocery");
        assertRoute("Find me some snacks", "/recommend/grocery");
        assertRoute("推荐啤酒", "/recommend/grocery");
        assertRoute("推荐零食", "/recommend/grocery");
        assertRoute("识别这张发票", "/invoices");
        assertRoute("Scan this supplier bill", "/invoices");
        assertRoute("Can you read this bill?", "/invoices");
        assertRoute("Can you check this invoice?", "/invoices");
        assertRoute("Scan this bill", "/invoices");
        assertRoute("Scan invoice", "/invoices");
        assertRoute("Read an invoice", "/invoices");
        assertRoute("Take a photo of this supplier bill", "/invoices");
        assertRoute("Take a photo of this invoice", "/invoices");
        assertRoute("Snap this supplier invoice", "/invoices");
        assertRoute("Read this supplier invoice", "/invoices");
        assertRoute("帮我看一下这张供应商发票", "/invoices");
        assertRoute("Who are our suppliers?", "/suppliers/odoo");
    }

    @Test
    void leavesUnrelatedQuestionsUntouched() {
        assertNull(WorkflowRouteRouter.maybeOverride("Create a supplier"));
        assertNull(WorkflowRouteRouter.maybeOverride("Edit supplier details"));
        assertNull(WorkflowRouteRouter.maybeOverride("Delete this purchase order"));
        assertNull(WorkflowRouteRouter.maybeOverride("Import a stocktake"));
        assertNull(WorkflowRouteRouter.maybeOverride("Start stocktake"));
        assertNull(WorkflowRouteRouter.maybeOverride("开始盘点"));
        assertNull(WorkflowRouteRouter.maybeOverride("Submit purchase order"));
        assertNull(WorkflowRouteRouter.maybeOverride("提交采购订单"));
        assertNull(WorkflowRouteRouter.maybeOverride("Submit replenishment suggestions"));
        assertNull(WorkflowRouteRouter.maybeOverride("保存这些价格建议"));
        assertNull(WorkflowRouteRouter.maybeOverride("Receive this supplier invoice"));
        assertNull(WorkflowRouteRouter.maybeOverride("Delete this invoice"));
        assertNull(WorkflowRouteRouter.maybeOverride("提交这张发票"));
        assertNull(WorkflowRouteRouter.maybeOverride("Import this invoice"));
        assertNull(WorkflowRouteRouter.maybeOverride("Upload this supplier bill"));
        assertNull(WorkflowRouteRouter.maybeOverride("Upload an invoice"));
        assertNull(WorkflowRouteRouter.maybeOverride("上传这张账单"));
        assertNull(WorkflowRouteRouter.maybeOverride("上传供应商发票"));
        assertNull(WorkflowRouteRouter.maybeOverride("供应商发票还有吗？"));
        assertNull(WorkflowRouteRouter.maybeOverride("帮我上传这张发票"));
        assertNull(WorkflowRouteRouter.maybeOverride("把供应商账单传上去"));
        assertNull(WorkflowRouteRouter.maybeOverride("Send this supplier bill"));
        assertNull(WorkflowRouteRouter.maybeOverride("开始处理这张发票"));
        assertNull(WorkflowRouteRouter.maybeOverride("直接把这些商品补到50件"));
        assertNull(WorkflowRouteRouter.maybeOverride("Top up these items to 50 units"));
        assertNull(WorkflowRouteRouter.maybeOverride("Create customer group"));
        assertNull(WorkflowRouteRouter.maybeOverride("Import gift cards"));
        assertNull(WorkflowRouteRouter.maybeOverride("编辑价目表"));
        assertNull(WorkflowRouteRouter.maybeOverride("How much did we spend on purchases last month?"));
        assertNull(WorkflowRouteRouter.maybeOverride("What did we sell most this week?"));
        assertNull(WorkflowRouteRouter.maybeOverride("How much stock is left?"));
        assertNull(WorkflowRouteRouter.maybeOverride("How much red wine sold this week?"));
        assertNull(WorkflowRouteRouter.maybeOverride("How much did we pay suppliers this month?"));
        assertNull(WorkflowRouteRouter.maybeOverride("What was our wine revenue yesterday?"));
        assertNull(WorkflowRouteRouter.maybeOverride("How many invoices did we receive?"));
        assertNull(WorkflowRouteRouter.maybeOverride("How much did we pay for this invoice?"));
        assertNull(WorkflowRouteRouter.maybeOverride("How many invoices did we receive last month?"));
        assertNull(WorkflowRouteRouter.maybeOverride("Do we have any invoices?"));
        assertNull(WorkflowRouteRouter.maybeOverride("发票还有吗？"));
        assertNull(WorkflowRouteRouter.maybeOverride("How many supplier bills did we receive?"));
        assertNull(WorkflowRouteRouter.maybeOverride("Have we received any bills?"));
        assertNull(WorkflowRouteRouter.maybeOverride("How much did we spend on purchases last month?"));
        assertNull(WorkflowRouteRouter.maybeOverride("What was our purchase history last week?"));
        assertNull(WorkflowRouteRouter.maybeOverride("What did we spend on replenishment last week?"));
        assertNull(WorkflowRouteRouter.maybeOverride("What did we spend on restocking last month?"));
        assertNull(WorkflowRouteRouter.maybeOverride("上周采购记录是什么"));
        assertNull(WorkflowRouteRouter.maybeOverride("本月补货花了多少钱"));
        assertNull(WorkflowRouteRouter.maybeOverride("Show me the pricing report for yesterday"));
        assertNull(WorkflowRouteRouter.maybeOverride("Show me the price suggestions from last week"));
        assertNull(WorkflowRouteRouter.maybeOverride("上周的价格建议有哪些"));
        assertNull(WorkflowRouteRouter.maybeOverride("上个月采购花了多少钱"));
        assertNull(WorkflowRouteRouter.maybeOverride("昨天的定价报告"));
        assertNull(WorkflowRouteRouter.maybeOverride("How many should I order?"));
    }

    @Test
    void handlesCaseAndPunctuationWithoutChangingRoutes() {
        assertRoute("  REORDER, please!  ", "/stock/replenishment");
        assertRoute("PRICE REVIEW?", "/stock/capped-pricing");
        assertRoute("推荐适合聚会的白葡萄酒。", "/sommelier");
        assertRoute("请识别这张发票。", "/invoices");
    }

    @Test
    void writeIntentDetectorCoversMutationsWithoutBlockingReadOnlyRequests() {
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Submit replenishment suggestions"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("保存这些价格建议"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Receive this supplier invoice"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Send this supplier bill"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("开始处理这张发票"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Place the purchase order"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Buy these items now"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Apply these prices"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("下单采购这些商品"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("执行补货"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("执行调价"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Submit the purchase order"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Confirm this order"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Save these price changes"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("提交采购订单"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("确认这些订单"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("保存价格变更"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Set these prices now"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Change these prices"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("设置这些价格"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("把这些建议下单"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("直接把价格改了"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("帮我把葡萄酒售价改了"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("直接把这些商品补到50件"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("把啤酒补到50件"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Top up these items to 50 units"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Top up all beer to 50 units"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Restock all beer to 50 units"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Order 50 units of beer"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("现在帮我把啤酒订 50 件"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("下单啤酒 12 箱"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Set Shiraz to 29.99"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("把 Shiraz 价格改成 29.99"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Create a customer"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("编辑这个产品"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Delete this supplier"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Receive this stock"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Archive this customer"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Restore this product"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Cancel this purchase order"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Deactivate this gift card"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("归档客户资料"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("恢复这个商品"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("取消这张采购订单"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("停用礼品卡"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Update the price"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("更新这个商品售价"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Save it"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Could you update it?"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("Please delete that"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("请保存一下"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("请帮忙保存一下"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("麻烦帮我确认一下"));
        assertFalse(WorkflowRouteRouter.hasWriteIntent("保存了吗？"));
        assertFalse(WorkflowRouteRouter.hasWriteIntent("商品删除了没有？"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("删除它"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("帮我确认一下"));

        assertTrue(WorkflowRouteRouter.hasWriteIntent("Upload this supplier bill"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("上传这张账单"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("帮我上传这张发票"));
        assertTrue(WorkflowRouteRouter.hasWriteIntent("把供应商账单传上去"));
        assertFalse(WorkflowRouteRouter.hasWriteIntent("How many supplier bills did we receive?"));
        assertFalse(WorkflowRouteRouter.hasWriteIntent("How many invoices did we receive?"));
        assertFalse(WorkflowRouteRouter.hasWriteIntent("Which prices need checking?"));
        assertFalse(WorkflowRouteRouter.hasWriteIntent("What did we send suppliers last week?"));
        assertFalse(WorkflowRouteRouter.hasWriteIntent("What should we buy before the weekend?"));
        assertFalse(WorkflowRouteRouter.hasWriteIntent("我应该买什么补货？"));
        assertFalse(WorkflowRouteRouter.hasWriteIntent("What price should I set for Shiraz?"));
        assertFalse(WorkflowRouteRouter.hasWriteIntent("AI会直接下单吗"));
        assertFalse(WorkflowRouteRouter.hasWriteIntent("AI 能自动下采购单吗"));
        assertFalse(WorkflowRouteRouter.hasWriteIntent("AI会自动改价吗"));
        assertFalse(WorkflowRouteRouter.hasWriteIntent("Will you place orders?"));
        assertFalse(WorkflowRouteRouter.hasWriteIntent("Show archived products"));
        assertFalse(WorkflowRouteRouter.hasWriteIntent("List cancelled orders"));
    }

    @Test
    void capabilityQuestionsDoNotNavigateToOperationalWorkflows() {
        for (String question : new String[]{
                "Can AI change prices?",
                "Can the assistant recommend wines?",
                "Does AI read supplier invoices?",
                "Can the AI answer stock questions?",
                "AI会自动改价吗",
                "AI能推荐红酒吗",
                "AI能识别供应商发票吗"
        }) {
            assertNull(WorkflowRouteRouter.maybeOverride(question), question);
        }
    }

    @Test
    void ignoresBlankQuestions() {
        assertNull(WorkflowRouteRouter.maybeOverride(null));
        assertNull(WorkflowRouteRouter.maybeOverride("   "));
    }

    private static void assertRoute(String question, String route) {
        WorkflowRouteRouter.Override override = WorkflowRouteRouter.maybeOverride(question);
        assertEquals("navigate", override.intent());
        assertEquals(route, override.route());
    }
}
