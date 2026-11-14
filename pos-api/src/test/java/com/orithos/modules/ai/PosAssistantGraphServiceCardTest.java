package com.orithos.modules.ai;

import com.orithos.modules.ai.dto.AssistantCard;
import com.orithos.modules.ai.dto.UiAction;
import com.orithos.modules.ai.report.TenantContext;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PosAssistantGraphServiceCardTest {

    @Test
    void clearsPreviousTurnReportPayloadAndProvenanceBeforeRunningTheNextTurn() {
        Map<String, Object> state = new java.util.HashMap<>();
        state.put("report_rows", List.of(Map.of("stock", 12)));
        state.put("report_columns", List.of("stock"));
        state.put("report_data_as_of", "2026-11-12T10:00:00+10:30");
        state.put("report_data_source", "orithos_ledger");
        state.put("report_store_scope", "current_authenticated_store");
        state.put("report_data_status", "available");
        state.put("report_period_from", "2026-11-12");
        state.put("report_period_to", "2026-11-12");
        state.put("answer", "Previous report answer");
        state.put("assistant_card", "previous card");
        state.put("conversation_history", "preserve conversation history");
        state.put("last_slots", Map.of("query", "Shiraz"));

        PosAssistantGraphService.clearTurnOutputState(state);

        assertEquals(List.of(), state.get("report_rows"));
        assertEquals(List.of(), state.get("report_columns"));
        assertEquals("", state.get("report_data_as_of"));
        assertEquals("", state.get("report_data_source"));
        assertEquals("", state.get("report_store_scope"));
        assertEquals("", state.get("report_data_status"));
        assertEquals("", state.get("report_period_from"));
        assertEquals("", state.get("report_period_to"));
        assertEquals("", state.get("answer"));
        assertEquals("", state.get("assistant_card"));
        assertEquals("preserve conversation history", state.get("conversation_history"));
        assertEquals(Map.of("query", "Shiraz"), state.get("last_slots"));
    }

    @Test
    void scopesConversationThreadsByTenantAndUser() {
        TenantContext firstUser = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of());
        TenantContext anotherUser = new TenantContext(42L, 8L, 3L, List.of(3L), Set.of());
        TenantContext anotherTenant = new TenantContext(43L, 7L, 3L, List.of(3L), Set.of());

        assertEquals("42:7:session-a", PosAssistantGraphService.resolveThreadId("session-a", firstUser));
        assertEquals("42:8:session-a", PosAssistantGraphService.resolveThreadId("session-a", anotherUser));
        assertEquals("43:7:session-a", PosAssistantGraphService.resolveThreadId("session-a", anotherTenant));
        assertEquals("42:7:session-a", PosAssistantGraphService.resolveThreadId("42:7:session-a", firstUser));
        assertEquals("42:8:42:7:session-a", PosAssistantGraphService.resolveThreadId("42:7:session-a", anotherUser));
    }

    @Test
    void genericGuidedActionStillHasWorkspaceCta() {
        AssistantCard card = PosAssistantGraphService.cardsFor(
                "guided_action", new UiAction("", "", "/", "guided_action"),
                "Please specify the target and exact change.").getFirst();

        assertEquals("guided_action", card.type());
        assertEquals("Open workspace", card.ctaLabel());
        assertEquals("/", card.ctaRoute());
        assertEquals("/", card.cta().route());
    }

    @Test
    void historicalStockFollowUpProducesLocalizedUnavailableCardWithStockPageCta() {
        for (String[] sample : new String[][]{
                {"and yesterday?", "Stock reports show a live snapshot; historical stock is unavailable. Open the stock page to view current stock.", "Historical stock", "Open stock list"},
                {"那昨天呢", "历史库存查询暂不可用；当前库存报表是实时快照，不能还原历史库存。请打开库存列表查看当前库存。", "历史库存", "打开库存列表"}
        }) {
            AssistantCard card = PosAssistantGraphService.cardsFor(
                    "stock_history_unavailable",
                    new UiAction("", "", "/stock/list", ""),
                    sample[1],
                    sample[0],
                    "historical_stock_unavailable").getFirst();

            assertEquals("stock_history", card.type());
            assertEquals(sample[2], card.title());
            assertEquals("unavailable", card.status());
            assertEquals(sample[1], card.summary());
            assertEquals(sample[1], card.emptyReason());
            assertEquals(false, card.retryable());
            assertEquals("/stock/list", card.cta().route());
            assertEquals(sample[3], card.cta().label());
            assertTrue(card.items().isEmpty());
        }
    }

    @Test
    void guidedActionWithoutARouteStillHasWorkspaceCta() {
        for (UiAction ui : List.of(
                new UiAction("", "", null, "guided_action"),
                new UiAction("", "", "   ", "guided_action"))) {
            AssistantCard card = PosAssistantGraphService.cardsFor(
                    "guided_action", ui, "Please specify the target and exact change.").getFirst();

            assertEquals("guided_action", card.type());
            assertEquals("ready", card.status());
            assertEquals("Open workspace", card.cta().label());
            assertEquals("/", card.cta().route());
        }
    }

    @Test
    void reconstructsSupportedCardsForHistoricalTurnsAndLeavesOtherTurnsAsText() {
        AssistantCard wine = PosAssistantGraphService.cardsForHistory(
                "navigate", "Top wine picks:\n• Shiraz — $28.00", "Recommend a red wine under $30.").getFirst();
        AssistantCard customerGroup = PosAssistantGraphService.cardsForHistory(
                "guided_action", "I can guide this customer group change.", "编辑客户分组").getFirst();

        assertEquals("sommelier", wine.type());
        assertEquals("/sommelier", wine.cta().route());
        assertEquals("guided_action", customerGroup.type());
        assertEquals("/customer-groups", customerGroup.cta().route());
        assertTrue(PosAssistantGraphService.cardsForHistory(
                "report_sales", "Sales were $1,240.", "Today's sales").isEmpty());
    }

    @Test
    void guidedActionCardLocalizesItsRouteCtaForChineseQuestions() {
        AssistantCard card = PosAssistantGraphService.cardsFor(
                "guided_action", new UiAction("customers", "customers", "/customers", "guided_action"),
                "我可以引导你处理客户资料变更。", "请帮我编辑客户").getFirst();

        assertEquals("操作指引", card.title());
        assertEquals("打开客户页面", card.ctaLabel());
        assertEquals("/customers", card.cta().route());
    }

    @Test
    void mapsPricingBriefToReadyCardWithReviewCtaAndTopThreeItems() {
        List<AssistantCard> cards = PosAssistantGraphService.cardsFor(
                "navigate",
                new UiAction("stock", "pricing", "/stock/capped-pricing", "navigate"),
                "Prices that need review:\n• Shiraz — $24.99 → suggest $27.95\n• Riesling — $19.99 → suggest $21.95\n• Merlot — $29.99 → suggest $31.95\n• Cabernet — $39.99 → suggest $41.95");

        assertEquals(1, cards.size());
        AssistantCard card = cards.getFirst();
        assertEquals("pricing", card.type());
        assertEquals("ready", card.status());
        assertEquals(3, card.items().size());
        assertEquals("Open price review", card.ctaLabel());
        assertEquals("/stock/capped-pricing", card.ctaRoute());
    }

    @Test
    void mapsEmptyPricingBriefToStableEmptyReason() {
        List<AssistantCard> cards = PosAssistantGraphService.cardsFor(
                "navigate",
                new UiAction("stock", "pricing", "/stock/capped-pricing", "navigate"),
                "No price suggestions need review right now.");

        AssistantCard card = cards.getFirst();
        assertEquals("empty", card.status());
        assertEquals("No price suggestions need review right now.", card.emptyReason());
        assertTrue(card.items().isEmpty());
    }

    @Test
    void mapsZeroProductCountToEmptyCardWithoutInventingItems() {
        List<AssistantCard> cards = PosAssistantGraphService.cardsFor(
                "product_count",
                new UiAction("products", "products", "/products", "navigate"),
                "This store has 0 sellable products in the catalogue.");

        AssistantCard card = cards.getFirst();
        assertEquals("empty", card.status());
        assertEquals("No sellable products are currently available in the catalogue.", card.emptyReason());
        assertTrue(card.items().isEmpty());
    }

    @Test
    void productCountCardKeepsTheRealNumberAndLeavesNavigationToItsCta() {
        AssistantCard card = PosAssistantGraphService.cardsFor(
                "product_count",
                new UiAction("products", "products", "/products", "navigate"),
                "This store has 4491 sellable products in the catalogue. Open Products to browse.").getFirst();

        assertEquals("ready", card.status());
        assertEquals("This store has 4491 sellable products in the catalogue.", card.summary());
        assertTrue(card.summary().contains("4491"));
        assertTrue(card.summary().contains("sellable products"));
        assertTrue(!card.summary().contains("Open Products to browse"));
        assertEquals("Open products", card.cta().label());
        assertEquals("/products", card.cta().route());
    }

    @Test
    void chineseProductCountCardDoesNotRepeatTheProductPageCtaInItsSummary() {
        AssistantCard card = PosAssistantGraphService.cardsFor(
                "product_count",
                new UiAction("products", "products", "/products", "navigate"),
                "本店商品目录共有 4491 个可售商品。打开商品目录查看。",
                "商品目录里有多少商品？").getFirst();

        assertEquals("ready", card.status());
        assertEquals("商品目录", card.title());
        assertEquals("本店商品目录共有 4491 个可售商品。", card.summary());
        assertTrue(card.summary().contains("4491"));
        assertTrue(!card.summary().contains("打开商品目录查看"));
        assertEquals("打开商品目录", card.cta().label());
        assertEquals("/products", card.cta().route());
    }

    @Test
    void unavailableProductCountCardKeepsFailureReasonWithoutDuplicatingNavigation() {
        AssistantCard card = PosAssistantGraphService.cardsFor(
                "product_count",
                new UiAction("products", "products", "/products", "navigate"),
                "Product count unavailable. Open Products to browse the catalogue.").getFirst();

        assertEquals("unavailable", card.status());
        assertEquals("Product count unavailable.", card.summary());
        assertEquals("/products", card.cta().route());
        assertTrue(card.items().isEmpty());
    }

    @Test
    void onlyOffersRetryForTransientUnavailableCards() {
        AssistantCard permission = PosAssistantGraphService.cardsFor(
                "product_count", new UiAction("products", "products", "/products", "navigate"),
                "You do not have permission to query the live product total.").getFirst();
        AssistantCard unlinked = PosAssistantGraphService.cardsFor(
                "product_count", new UiAction("products", "products", "/products", "navigate"),
                "This store is not connected to the Orithos service.").getFirst();
        AssistantCard notConfigured = PosAssistantGraphService.cardsFor(
                "product_count", new UiAction("products", "products", "/products", "navigate"),
                "Orithos is not configured for this store.").getFirst();
        AssistantCard notConfiguredChinese = PosAssistantGraphService.cardsFor(
                "product_count", new UiAction("products", "products", "/products", "navigate"),
                "当前门店尚未配置 Orithos。", "商品总数").getFirst();
        AssistantCard notConfiguredEnglishForChineseQuestion = PosAssistantGraphService.cardsFor(
                "product_count", new UiAction("products", "products", "/products", "navigate"),
                "Orithos is not configured for this store.", "商品总数").getFirst();
        AssistantCard transientFailure = PosAssistantGraphService.cardsFor(
                "product_count", new UiAction("products", "products", "/products", "navigate"),
                "Live product count is unavailable right now. Please retry.").getFirst();

        assertEquals(false, permission.retryable());
        assertEquals(false, unlinked.retryable());
        assertEquals("unavailable", notConfigured.status());
        assertEquals(false, notConfigured.retryable());
        assertEquals("unavailable", notConfiguredChinese.status());
        assertEquals(false, notConfiguredChinese.retryable());
        assertEquals("当前门店尚未配置此功能，请联系管理员完成配置。", notConfiguredChinese.summary());
        assertEquals("unavailable", notConfiguredEnglishForChineseQuestion.status());
        assertEquals(false, notConfiguredEnglishForChineseQuestion.retryable());
        assertEquals("当前门店尚未配置此功能，请联系管理员完成配置。",
                notConfiguredEnglishForChineseQuestion.summary());
        assertEquals("/products", notConfigured.cta().route());
        assertEquals("/products", notConfiguredChinese.cta().route());
        assertEquals(true, transientFailure.retryable());
    }

    @Test
    void mapsNaturalLanguageZeroProductCountToEmptyCard() {
        for (String answer : List.of(
                "There are 0 products in the catalogue.",
                "商品总数为 0。打开商品页查看目录。")) {
            AssistantCard card = PosAssistantGraphService.cardsFor(
                    "product_count",
                    new UiAction("products", "products", "/products", "navigate"),
                    answer).getFirst();

            assertEquals("empty", card.status(), answer);
            assertTrue(card.items().isEmpty(), answer);
        }
    }

    @Test
    void mapsChineseZeroProductCountToLocalizedEmptyCard() {
        AssistantCard card = PosAssistantGraphService.cardsFor(
                "product_count", new UiAction("products", "products", "/products", "navigate"),
                "本店商品目录共有 0 个可售商品。", "商品目录里有多少商品？").getFirst();

        assertEquals("empty", card.status());
        assertEquals("本店商品目录共有 0 个可售商品。", card.summary());
        assertEquals("当前商品目录中没有可售商品。", card.emptyReason());
        assertTrue(card.items().isEmpty());
    }

    @Test
    void mapsUnavailableSommelierBriefWithoutInventingItems() {
        List<AssistantCard> cards = PosAssistantGraphService.cardsFor(
                "navigate",
                new UiAction("sommelier", "recommend", "/sommelier", "navigate"),
                "Live wine recommendations are unavailable right now. Retry or open Sommelier.");

        AssistantCard card = cards.getFirst();
        assertEquals("unavailable", card.status());
        assertEquals("Live wine recommendations are unavailable right now.", card.summary());
        assertEquals(card.summary(), card.emptyReason());
        assertTrue(card.items().isEmpty());
    }

    @Test
    void mapsRecommendationServiceFailuresToUnavailableCardsWithTheirPageCtas() {
        for (String[] sample : new String[][]{
                {"/sommelier", "Wine recommendations are unavailable right now. Open Sommelier to retry."},
                {"/stock/replenishment", "Replenishment suggestions are unavailable right now. Open replenishment to retry."},
                {"/stock/capped-pricing", "Price review suggestions are unavailable right now. Open price review to retry."}
        }) {
            AssistantCard card = PosAssistantGraphService.cardsFor(
                    "navigate", new UiAction("", "", sample[0], "navigate"), sample[1]).getFirst();

            assertEquals("unavailable", card.status(), sample[0]);
            assertTrue(card.items().isEmpty(), sample[0]);
            String reason = sample[1].split("\\.", 2)[0] + ".";
            assertEquals(reason, card.summary(), sample[0]);
            assertEquals(reason, card.emptyReason(), sample[0]);
            assertEquals(sample[0], card.cta().route());
        }
    }

    @Test
    void mapsChineseUnavailableBriefWithPageCtaAndWithoutItems() {
        for (String answer : List.of(
                "品鉴推荐暂不可用，请打开品鉴页面重试。",
                "目前品鉴服务不可用，请打开品鉴页面重试。")) {
            AssistantCard card = PosAssistantGraphService.cardsFor(
                    "navigate", new UiAction("sommelier", "recommend", "/sommelier", "navigate"),
                    answer, "给我推荐一款红酒").getFirst();

            assertEquals("unavailable", card.status());
            assertEquals("品鉴推荐", card.title());
            assertEquals("打开品鉴推荐", card.ctaLabel());
            assertEquals("品鉴推荐暂不可用，请稍后重试。", card.summary());
            assertEquals(card.summary(), card.emptyReason());
            assertTrue(card.items().isEmpty());
            assertEquals("/sommelier", card.cta().route());
        }
    }

    @Test
    void localizesEnglishUnavailableReasonsForChineseRecommendationCards() {
        for (String[] sample : new String[][]{
                {"/sommelier", "Wine recommendations are unavailable right now.", "品鉴推荐暂不可用，请稍后重试。"},
                {"/stock/replenishment", "Supply-chain data unavailable.", "补货建议暂不可用，请稍后重试。"},
                {"/stock/capped-pricing", "Price review not available.", "价格复核建议暂不可用，请稍后重试。"},
                {"/recommend/grocery", "Grocery recommendations are unavailable.", "商品推荐暂不可用，请稍后重试。"}
        }) {
            AssistantCard card = PosAssistantGraphService.cardsFor(
                    "navigate", new UiAction("", "", sample[0], "navigate"),
                    sample[1], "请给我一些建议").getFirst();

            assertEquals("unavailable", card.status(), sample[0]);
            assertEquals(sample[2], card.summary(), sample[0]);
            assertEquals(sample[2], card.emptyReason(), sample[0]);
            assertTrue(card.items().isEmpty(), sample[0]);
            assertEquals(sample[0], card.cta().route(), sample[0]);
        }
    }

    @Test
    void localizesPermissionAndStoreBindingFailuresWithoutLosingTheirMeaning() {
        for (String[] sample : new String[][]{
                {"You do not have permission to query the live product total.", "当前账号没有权限查询此数据，请联系管理员或检查门店权限。"},
                {"This account is not bound to a store.", "请先登录并确认账号已绑定门店，然后重试。"}
        }) {
            AssistantCard card = PosAssistantGraphService.cardsFor(
                    "product_count", new UiAction("", "products", "/products", ""),
                    sample[0], "商品总数是多少？").getFirst();

            assertEquals("unavailable", card.status(), sample[0]);
            assertEquals(sample[1], card.summary(), sample[0]);
            assertEquals(sample[1], card.emptyReason(), sample[0]);
            assertEquals("/products", card.cta().route());
        }
    }

    @Test
    void mapsGroceryRecommendationsToReadyCardWithAtMostThreeItemsAndPageCta() {
        AssistantCard card = PosAssistantGraphService.cardsFor(
                "navigate",
                new UiAction("recommend", "grocery", "/recommend/grocery", "navigate"),
                "In-stock grocery picks:\n• Craft lager — $18.00\n• Sparkling water — $4.50\n• Chips — $5.00\n• Soft drink — $3.50").getFirst();

        assertEquals("recommend", card.type());
        assertEquals("Grocery recommendations", card.title());
        assertEquals("ready", card.status());
        assertEquals("catalogue", card.source());
        assertEquals(3, card.items().size());
        assertEquals("/recommend/grocery", card.cta().route());
        assertEquals("Open grocery recommendations", card.ctaLabel());
    }

    @Test
    void mapsEmptyGroceryRecommendationsToEmptyCardWithReasonAndCta() {
        AssistantCard card = PosAssistantGraphService.cardsFor(
                "navigate",
                new UiAction("recommend", "grocery", "/recommend/grocery", "navigate"),
                "No grocery recommendations match those preferences.").getFirst();

        assertEquals("empty", card.status());
        assertEquals("No grocery recommendations match those preferences right now.", card.emptyReason());
        assertEquals(card.emptyReason(), card.summary());
        assertTrue(card.items().isEmpty());
        assertEquals("/recommend/grocery", card.cta().route());
    }

    @Test
    void mapsActualEmptyBriefResponsesToEmptyCardsInsteadOfReadyCards() {
        for (String[] sample : new String[][]{
                {"/stock/replenishment", "哪些商品需要补货？", "当前库存可覆盖目标周期，暂时没有补货数量建议。打开补货页面查看。"},
                {"/stock/capped-pricing", "哪些价格需要复核？", "近期样本中没有需要提高毛利的价格建议。打开价格复核页面查看。"},
                {"/sommelier", "推荐一款红酒", "目前没有符合条件的酒款：Nothing in stock matches that type and budget. 打开品鉴推荐页面调整条件。"},
                {"/sommelier", "推荐一款红酒", "当前目录中没有匹配的酒款。可以调整类型或预算，或打开品鉴推荐页面查看。"},
                {"/sommelier", "Recommend wine", "No wine products are in this store's catalogue yet."},
                {"/sommelier", "Recommend wine", "Nothing in stock matches that type and budget."}
        }) {
            AssistantCard card = PosAssistantGraphService.cardsFor(
                    "navigate", new UiAction("", "", sample[0], "navigate"), sample[2], sample[1]).getFirst();

            assertEquals("empty", card.status(), sample[2]);
            assertTrue(card.items().isEmpty(), sample[2]);
            assertTrue(card.emptyReason() != null, sample[2]);
            assertEquals(sample[0], card.cta().route(), sample[2]);
        }
    }

    @Test
    void mapsBlankBriefResponsesToUnavailableCards() {
        for (String question : List.of("Recommend a wine", "请推荐一款红酒")) {
            AssistantCard card = PosAssistantGraphService.cardsFor(
                    "navigate", new UiAction("", "", "/sommelier", "navigate"), "  \n ", question).getFirst();

            assertEquals("unavailable", card.status());
            assertTrue(card.summary().toLowerCase(java.util.Locale.ROOT).contains("unavailable")
                    || card.summary().contains("暂不可用"));
            assertTrue(card.items().isEmpty());
        }
    }

    @Test
    void mapsReplenishmentTimeoutResponsesToRetryableUnavailableCards() {
        for (String[] sample : new String[][]{
                {"What should I restock?", "The replenishment query timed out, so no suggestions were generated."},
                {"补货建议", "补货查询超时，未生成建议。请稍后重试或打开补货页面。"}
        }) {
            AssistantCard card = PosAssistantGraphService.cardsFor(
                    "navigate",
                    new UiAction("stock", "replenishment", "/stock/replenishment", "navigate"),
                    sample[1], sample[0]).getFirst();

            assertEquals("unavailable", card.status(), sample[1]);
            assertTrue(card.retryable(), sample[1]);
            assertTrue(card.items().isEmpty(), sample[1]);
        }
    }

    @Test
    void keepsPartialReplenishmentSuggestionsReadyWhenExcludedItemsHaveSupplierGaps() {
        for (String[] sample : new String[][]{
                {"What should I restock?", "Top restock suggestions (21d cover): 3 items need order.\n"
                        + "Source: Orithos inventory and sales ledger.\n\n"
                        + "• VB Cans — order 24\n\n"
                        + "Some items were excluded because data is missing: Shiraz: supplier unavailable."},
                {"给我补货建议", "建议补货（覆盖 21 天）：3 个商品需要补货。\n"
                        + "数据来源：Orithos 库存与销售账本。\n\n"
                        + "• VB Cans — 建议订购 24\n\n"
                        + "注意：部分商品因数据缺失未纳入建议：Shiraz: supplier unavailable。"}
        }) {
            AssistantCard card = PosAssistantGraphService.cardsFor(
                    "navigate",
                    new UiAction("stock", "replenishment", "/stock/replenishment", "navigate"),
                    sample[1], sample[0]).getFirst();

            assertEquals("ready", card.status(), sample[1]);
            assertEquals(false, card.retryable(), sample[1]);
            assertEquals(1, card.items().size(), sample[1]);
            assertEquals("VB Cans — " + (sample[0].contains("给我") ? "建议订购 24" : "order 24"),
                    card.items().getFirst().get("label"), sample[1]);
        }
    }

    @Test
    void mapsUnavailableGroceryRecommendationsWithoutExtractingItems() {
        AssistantCard card = PosAssistantGraphService.cardsFor(
                "navigate",
                new UiAction("recommend", "grocery", "/recommend/grocery", "navigate"),
                "Grocery recommendations are unavailable right now.\n• Fictional product — $1.00").getFirst();

        assertEquals("unavailable", card.status());
        assertEquals("Grocery recommendations are unavailable right now.", card.emptyReason());
        assertEquals(card.emptyReason(), card.summary());
        assertTrue(card.items().isEmpty());
        assertEquals("/recommend/grocery", card.cta().route());
    }

    @Test
    void preservesTheSpecificUnavailableReasonOnProductCountCards() {
        for (String answer : List.of(
                "You do not have permission to query the live product total.",
                "Live product count is unavailable right now. Please try again shortly.",
                "暂时无法获取实时商品总数，请稍后重试。",
                "当前暂时无法获取商品总数，请稍后重试。",
                "请先登录门店账号，才能查询实时商品总数。",
                "当前账号尚未绑定门店，暂时无法查询实时商品总数。",
                "你没有权限查询实时商品总数。")) {
            AssistantCard card = PosAssistantGraphService.cardsFor(
                    "product_count",
                    new UiAction("", "products", "/products", ""),
                    answer).getFirst();

            assertEquals("unavailable", card.status(), answer);
            assertEquals(answer, card.summary(), answer);
            assertEquals(answer, card.emptyReason(), answer);
            assertTrue(card.items().isEmpty(), answer);
            assertEquals("/products", card.cta().route(), answer);
        }
    }

    @Test
    void mapsGuidedActionToAnExplicitReadOnlyWorkflowCard() {
        List<AssistantCard> cards = PosAssistantGraphService.cardsFor(
                "guided_action",
                new UiAction("products", "products", "/products", "navigate"),
                "I can guide this change, but saving business data must be completed and confirmed on the page.");

        assertEquals(1, cards.size());
        AssistantCard card = cards.getFirst();
        assertEquals("guided_action", card.type());
        assertEquals("ready", card.status());
        assertEquals("assistant", card.source());
        assertEquals("/products", card.ctaRoute());
        assertEquals("Open products", card.ctaLabel());
        assertEquals("Open products", card.cta().label());
        assertEquals("/products", card.cta().route());
        assertEquals(List.of(), card.items());
    }

    @Test
    void guidedActionCardsKeepTheRouteAndSpecificCtaForEverySupportedWriteWorkflow() {
        Map<String, String> routeLabels = Map.ofEntries(
                Map.entry("/customers", "Open customers"),
                Map.entry("/customers/balances", "Open customer balances"),
                Map.entry("/products", "Open products"),
                Map.entry("/orders", "Open orders"),
                Map.entry("/classifications", "Open classifications"),
                Map.entry("/customer-groups", "Open customer groups"),
                Map.entry("/pricelists", "Open price lists"),
                Map.entry("/giftcards", "Open gift cards"),
                Map.entry("/stock/replenishment", "Open replenishment"),
                Map.entry("/stock/capped-pricing", "Open price review"),
                Map.entry("/stock/buying-periods", "Open buying periods"),
                Map.entry("/stocktake", "Open stocktake"),
                Map.entry("/invoices", "Open supplier invoices"),
                Map.entry("/invoices/scan", "Open supplier invoices"),
                Map.entry("/invoices/new", "Scan supplier invoice"),
                Map.entry("/suppliers", "Open suppliers"));

        routeLabels.forEach((route, label) -> {
            AssistantCard card = PosAssistantGraphService.cardsFor(
                    "guided_action",
                    new UiAction("", "", route, "navigate"),
                    "Saving business data must be completed and confirmed on the page.").getFirst();

            assertEquals("guided_action", card.type(), route);
            assertEquals("ready", card.status(), route);
            assertEquals(route, card.ctaRoute(), route);
            assertEquals(route, card.cta().route(), route);
            assertEquals(label, card.cta().label(), route);
        });
    }

    @Test
    void extractsNumberedRecommendationLinesIntoAtMostThreeCardItems() {
        List<AssistantCard> cards = PosAssistantGraphService.cardsFor(
                "navigate",
                new UiAction("sommelier", "recommend", "/sommelier", "navigate"),
                "I found these matches:\n1. Shiraz — $24.99\n2) Pinot Noir — $28.00\n- Cabernet — $29.50\n• Merlot — $31.00");

        AssistantCard card = cards.getFirst();
        assertEquals(3, card.items().size());
        assertEquals("Shiraz — $24.99", card.items().getFirst().get("label"));
        assertEquals("I found these matches:", card.summary());
    }

    @Test
    void givesWorkflowCardsRouteSpecificCtaLabels() {
        AssistantCard replenishment = PosAssistantGraphService.cardsFor(
                "navigate",
                new UiAction("stock", "replenishment", "/stock/replenishment", "navigate"),
                "Top restock suggestions:\n• Shiraz — order 4").getFirst();
        AssistantCard sommelier = PosAssistantGraphService.cardsFor(
                "navigate",
                new UiAction("sommelier", "recommend", "/sommelier", "navigate"),
                "Here are in-stock picks:\n• Shiraz — $24.99").getFirst();

        assertEquals("Open replenishment", replenishment.ctaLabel());
        assertEquals("Open Sommelier", sommelier.ctaLabel());

        for (String[] target : new String[][]{
                {"/classifications", "Open classifications"},
                {"/customer-groups", "Open customer groups"},
                {"/customers/balances", "Open customer balances"},
                {"/giftcards", "Open gift cards"},
                {"/pricelists", "Open price lists"},
                {"/stock/buying-periods", "Open buying periods"},
                {"/stocktake", "Open stocktake"}
        }) {
            AssistantCard card = PosAssistantGraphService.cardsFor(
                    "guided_action", new UiAction("", "", target[0], "navigate"),
                    "Complete this change on the page.").getFirst();
            assertEquals(target[0], card.cta().route());
            assertEquals(target[1], card.ctaLabel());
            assertEquals(target[1], card.cta().label());
        }
    }

    @Test
    void keepsLegacyTenArgumentCardConstructionValid() {
        AssistantCard card = new AssistantCard(
                "pricing", "Price review", "summary", List.of(), "orithos_ledger", "now", null,
                "ready", "Open price review", "/stock/capped-pricing");

        assertEquals("orithos_ledger", card.source());
        assertEquals("/stock/capped-pricing", card.ctaRoute());
        assertEquals(null, card.cta());
    }
}
