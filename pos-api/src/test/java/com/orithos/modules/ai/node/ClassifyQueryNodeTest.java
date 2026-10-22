package com.orithos.modules.ai.node;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatOptions;
import com.orithos.modules.ai.AiProperties;
import com.orithos.modules.ai.configstore.IntentConfigService;
import com.orithos.modules.ai.configstore.IntentSanitizeService;
import com.orithos.modules.ai.pricing.PricingChatBrief;
import com.orithos.modules.ai.replenishment.ReplenishmentChatBrief;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.ObjectProvider;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ClassifyQueryNodeTest {

    @Test
    void classifierRequestUsesEndpointForItsSelectedModel() {
        DashScopeChatOptions textOptions = ClassifyQueryNode.classifyOptions(aiProperties("qwen-flash"));
        assertEquals("qwen-flash", textOptions.getModel());
        assertFalse(textOptions.getMultiModel());

        DashScopeChatOptions multimodalOptions = ClassifyQueryNode.classifyOptions(aiProperties("qwen3.8-flash"));
        assertEquals("qwen3.8-flash", multimodalOptions.getModel());
        assertTrue(multimodalOptions.getMultiModel());
    }

    private static AiProperties aiProperties(String classifyModel) {
        return new AiProperties(true, "test", "qwen3-asr-flash", "qwen-vl-plus", classifyModel,
                0.1, 512, 40, 6, 120);
    }

    @Test
    void explicitWorkflowSkipsClassifierWhenProviderIsUnavailable() {
        ChatClient chatClient = mock(ChatClient.class);
        IntentConfigService config = mock(IntentConfigService.class);
        IntentSanitizeService sanitizer = mock(IntentSanitizeService.class);
        AiProperties properties = mock(AiProperties.class);
        ClassifyQueryNode node = new ClassifyQueryNode(chatClient, config, sanitizer, properties);
        OverAllState state = mock(OverAllState.class);
        when(state.value("question", String.class)).thenReturn(Optional.of("Upload this supplier bill"));

        Map<String, Object> result = node.apply(state);

        assertEquals("navigate", result.get("intent"));
        assertEquals("/invoices/scan", result.get("ui_route"));
        verifyNoInteractions(chatClient, config, sanitizer, properties);
    }

    @Test
    void explicitWriteIntentFailsClosedBeforeClassifier() {
        ChatClient chatClient = mock(ChatClient.class);
        IntentConfigService config = mock(IntentConfigService.class);
        IntentSanitizeService sanitizer = mock(IntentSanitizeService.class);
        AiProperties properties = mock(AiProperties.class);
        ClassifyQueryNode node = new ClassifyQueryNode(chatClient, config, sanitizer, properties);

        for (String question : new String[] {
                "Submit replenishment suggestions",
                "保存这些价格建议",
                "Receive this supplier invoice",
                "提交这张发票",
                "Delete this invoice",
                "Import this invoice",
                "Send this supplier bill",
                "开始处理这张发票",
                "Place the purchase order",
                "Buy these items now",
                "Apply these prices",
                "下单采购这些商品",
                "执行补货",
                "执行调价",
                "Submit the purchase order",
                "Confirm this order",
                "Save these price changes",
                "提交采购订单",
                "确认这些订单",
                "保存价格变更",
                "Set these prices now",
                "Change these prices",
                "设置这些价格",
                "把这些建议下单",
                "直接把价格改了"
        }) {
            OverAllState state = mock(OverAllState.class);
            when(state.value("question", String.class)).thenReturn(Optional.of(question));

            Map<String, Object> result = node.apply(state);

            assertEquals("guided_action", result.get("intent"), question);
        }

        verifyNoInteractions(chatClient, config, sanitizer, properties);
    }

    @Test
    void stockWriteIntentFailsClosedWithoutRouteOrClassifier() {
        ChatClient chatClient = mock(ChatClient.class);
        IntentConfigService config = mock(IntentConfigService.class);
        IntentSanitizeService sanitizer = mock(IntentSanitizeService.class);
        AiProperties properties = mock(AiProperties.class);
        ClassifyQueryNode node = new ClassifyQueryNode(chatClient, config, sanitizer, properties);
        OverAllState state = mock(OverAllState.class);
        when(state.value("question", String.class)).thenReturn(Optional.of("把啤酒补到50件"));

        Map<String, Object> result = node.apply(state);

        assertEquals("guided_action", result.get("intent"));
        assertEquals("/stock/replenishment", result.get("ui_route"));
        assertTrue(String.valueOf(result.get("intent_summary")).toLowerCase().contains("cannot change stock"));
        verifyNoInteractions(chatClient, config, sanitizer, properties);
    }

    @Test
    void entityWriteIntentUsesGuidedActionAndPageCta() {
        ChatClient chatClient = mock(ChatClient.class);
        IntentConfigService config = mock(IntentConfigService.class);
        IntentSanitizeService sanitizer = mock(IntentSanitizeService.class);
        AiProperties properties = mock(AiProperties.class);
        ClassifyQueryNode node = new ClassifyQueryNode(chatClient, config, sanitizer, properties);

        for (String[] sample : new String[][] {
                {"Create a customer", "/customers"},
                {"编辑这个产品", "/products"},
                {"Receive this stock", "/stock/replenishment"},
                {"Receive this supplier invoice", "/invoices/scan"},
                {"Submit replenishment suggestions", "/stock/replenishment"},
                {"Apply these prices", "/stock/capped-pricing"},
                {"Execute pricing", "/stock/capped-pricing"},
                {"Buy these items now", "/orders"},
                {"Order these products", "/orders"},
                {"保存这些价格建议", "/stock/capped-pricing"}
        }) {
            OverAllState state = mock(OverAllState.class);
            when(state.value("question", String.class)).thenReturn(Optional.of(sample[0]));

            Map<String, Object> result = node.apply(state);

            assertEquals("guided_action", result.get("intent"), sample[0]);
            assertEquals(sample[1], result.get("ui_route"), sample[0]);
        }
        verifyNoInteractions(chatClient, config, sanitizer, properties);
    }

    @Test
    void productCountUtteranceSkipsClassifierAndOpensProducts() {
        ChatClient chatClient = mock(ChatClient.class);
        IntentConfigService config = mock(IntentConfigService.class);
        IntentSanitizeService sanitizer = mock(IntentSanitizeService.class);
        AiProperties properties = mock(AiProperties.class);
        ClassifyQueryNode node = new ClassifyQueryNode(chatClient, config, sanitizer, properties);
        OverAllState state = mock(OverAllState.class);
        when(state.value("question", String.class)).thenReturn(Optional.of("一共有多少产品"));

        Map<String, Object> result = node.apply(state);

        assertEquals("product_count", result.get("intent"));
        assertEquals("/products", result.get("ui_route"));
        assertEquals("product_count", result.get("fast_path_id"));
        assertEquals("deterministic", result.get("route_source"));
        assertEquals(false, result.get("llm_fallback"));
        assertTrue(String.valueOf(result.get("intent_summary")).toLowerCase().contains("product"));
        verifyNoInteractions(chatClient, config, sanitizer, properties);
    }

    @Test
    void commonProductCountVariantsUseProductCountFastPath() {
        ChatClient chatClient = mock(ChatClient.class);
        IntentConfigService config = mock(IntentConfigService.class);
        IntentSanitizeService sanitizer = mock(IntentSanitizeService.class);
        AiProperties properties = mock(AiProperties.class);
        ClassifyQueryNode node = new ClassifyQueryNode(chatClient, config, sanitizer, properties);

        for (String question : new String[]{
                "有多少个产品？",
                "商品总数",
                "How many products are there?",
                "what is the number of items we stock?",
                "catalogue size"
        }) {
            OverAllState state = mock(OverAllState.class);
            when(state.value("question", String.class)).thenReturn(Optional.of(question));

            Map<String, Object> result = node.apply(state);

            assertEquals("product_count", result.get("intent"), question);
            verifyNoInteractions(chatClient, config, sanitizer, properties);
        }
    }

    @Test
    void relativeFollowUpReusesLastReportIntent() {
        ChatClient chatClient = mock(ChatClient.class);
        IntentConfigService config = mock(IntentConfigService.class);
        IntentSanitizeService sanitizer = mock(IntentSanitizeService.class);
        AiProperties properties = mock(AiProperties.class);
        ClassifyQueryNode node = new ClassifyQueryNode(chatClient, config, sanitizer, properties);
        OverAllState state = mock(OverAllState.class);
        when(state.value("question", String.class)).thenReturn(Optional.of("那昨天呢"));
        when(state.value("last_intent", String.class)).thenReturn(Optional.of("report_sales"));
        when(state.value("last_slots")).thenReturn(Optional.of(Map.of("category", "beer")));

        Map<String, Object> result = node.apply(state);

        assertEquals("report_sales", result.get("intent"));
        assertEquals(Map.of("category", "beer"), result.get("slots"));
        verifyNoInteractions(chatClient, config, sanitizer, properties);
    }

    @Test
    void unsupportedAdhocReportSkipsClassifierWhenProviderIsUnavailable() {
        ChatClient chatClient = mock(ChatClient.class);
        IntentConfigService config = mock(IntentConfigService.class);
        IntentSanitizeService sanitizer = mock(IntentSanitizeService.class);
        AiProperties properties = mock(AiProperties.class);
        ClassifyQueryNode node = new ClassifyQueryNode(chatClient, config, sanitizer, properties);
        OverAllState state = mock(OverAllState.class);
        when(state.value("question", String.class))
                .thenReturn(Optional.of("What did we sell most this week?"));

        Map<String, Object> result = node.apply(state);

        assertEquals("report_adhoc", result.get("intent"));
        assertEquals("This custom report is not available yet.", result.get("intent_summary"));
        assertEquals("", result.get("ui_route"));
        verifyNoInteractions(chatClient, config, sanitizer, properties);
    }

    @Test
    void unsupportedRankingSkipsClassifierWithSafeAdhocIntent() {
        ChatClient chatClient = mock(ChatClient.class);
        IntentConfigService config = mock(IntentConfigService.class);
        IntentSanitizeService sanitizer = mock(IntentSanitizeService.class);
        AiProperties properties = mock(AiProperties.class);
        ClassifyQueryNode node = new ClassifyQueryNode(chatClient, config, sanitizer, properties);
        OverAllState state = mock(OverAllState.class);
        when(state.value("question", String.class)).thenReturn(Optional.of("本周哪类商品卖得最好"));

        Map<String, Object> result = node.apply(state);

        assertEquals("report_adhoc", result.get("intent"));
        assertEquals("", result.get("ui_route"));
        verifyNoInteractions(chatClient, config, sanitizer, properties);
    }

    @Test
    void namedProductLookupSkipsClassifierWhenProviderIsUnavailable() {
        ChatClient chatClient = mock(ChatClient.class);
        IntentConfigService config = mock(IntentConfigService.class);
        IntentSanitizeService sanitizer = mock(IntentSanitizeService.class);
        AiProperties properties = mock(AiProperties.class);
        ClassifyQueryNode node = new ClassifyQueryNode(chatClient, config, sanitizer, properties);
        OverAllState state = mock(OverAllState.class);
        when(state.value("question", String.class)).thenReturn(Optional.of("look up product DEMO"));

        Map<String, Object> result = node.apply(state);

        assertEquals("search_product", result.get("intent"));
        assertEquals(Map.of("query", "DEMO"), result.get("slots"));
        assertEquals("/products", result.get("ui_route"));
        verifyNoInteractions(chatClient, config, sanitizer, properties);
    }

    @Test
    void explicitDateSalesSkipsClassifierWhenProviderIsUnavailable() {
        ChatClient chatClient = mock(ChatClient.class);
        IntentConfigService config = mock(IntentConfigService.class);
        IntentSanitizeService sanitizer = mock(IntentSanitizeService.class);
        AiProperties properties = mock(AiProperties.class);
        ClassifyQueryNode node = new ClassifyQueryNode(chatClient, config, sanitizer, properties);
        OverAllState state = mock(OverAllState.class);
        when(state.value("question", String.class)).thenReturn(Optional.of("14,oct sales"));

        Map<String, Object> result = node.apply(state);

        assertEquals("report_sales", result.get("intent"));
        verifyNoInteractions(chatClient, config, sanitizer, properties);
    }

    @Test
    void customComparisonKeepsGuidedRefusalAheadOfDateShortcut() {
        ChatClient chatClient = mock(ChatClient.class);
        IntentConfigService config = mock(IntentConfigService.class);
        IntentSanitizeService sanitizer = mock(IntentSanitizeService.class);
        AiProperties properties = mock(AiProperties.class);
        ClassifyQueryNode node = new ClassifyQueryNode(chatClient, config, sanitizer, properties);
        OverAllState state = mock(OverAllState.class);
        when(state.value("question", String.class))
                .thenReturn(Optional.of("Compare sales on 14 Oct with 15 Oct"));

        Map<String, Object> result = node.apply(state);

        assertEquals("report_adhoc", result.get("intent"));
        verifyNoInteractions(chatClient, config, sanitizer, properties);
    }

    @Test
    void restockWorkflowUsesChatBriefInsteadOfPlaceholder() {
        ChatClient chatClient = mock(ChatClient.class);
        IntentConfigService config = mock(IntentConfigService.class);
        IntentSanitizeService sanitizer = mock(IntentSanitizeService.class);
        AiProperties properties = mock(AiProperties.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<ReplenishmentChatBrief> replenishmentProvider = mock(ObjectProvider.class);
        ReplenishmentChatBrief brief = mock(ReplenishmentChatBrief.class);
        when(replenishmentProvider.getIfAvailable()).thenReturn(brief);
        when(brief.brief(anyString(), any())).thenReturn(
                "Top restock suggestions (21d cover): 2 items need order.\n• VB — order 12\nTap below to review quantities and confirm any order.");

        ClassifyQueryNode node = new ClassifyQueryNode(
                chatClient, config, sanitizer, properties, null, null, replenishmentProvider, null);
        OverAllState state = mock(OverAllState.class);
        when(state.value("question", String.class)).thenReturn(Optional.of("What should I restock?"));

        Map<String, Object> result = node.apply(state);

        assertEquals("navigate", result.get("intent"));
        assertEquals("/stock/replenishment", result.get("ui_route"));
        assertTrue(String.valueOf(result.get("intent_summary")).contains("Top restock suggestions"));
        assertFalse(String.valueOf(result.get("intent_summary")).contains("Opening the requested workflow"));
        verifyNoInteractions(chatClient, config, sanitizer, properties);
    }

    @Test
    void pricingWorkflowUsesChatBriefInsteadOfPlaceholder() {
        ChatClient chatClient = mock(ChatClient.class);
        IntentConfigService config = mock(IntentConfigService.class);
        IntentSanitizeService sanitizer = mock(IntentSanitizeService.class);
        AiProperties properties = mock(AiProperties.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<PricingChatBrief> pricingProvider = mock(ObjectProvider.class);
        PricingChatBrief brief = mock(PricingChatBrief.class);
        when(pricingProvider.getIfAvailable()).thenReturn(brief);
        when(brief.brief(anyString(), any())).thenReturn(
                "Prices that need review (target ≈30% net margin):\n• Shiraz — $24.99 → suggest $27.95\nTap below to open price review. Staff confirm any change on the page.");

        ClassifyQueryNode node = new ClassifyQueryNode(
                chatClient, config, sanitizer, properties, null, null, null, pricingProvider);
        OverAllState state = mock(OverAllState.class);
        when(state.value("question", String.class)).thenReturn(Optional.of("Which prices to review?"));

        Map<String, Object> result = node.apply(state);

        assertEquals("navigate", result.get("intent"));
        assertEquals("/stock/capped-pricing", result.get("ui_route"));
        assertTrue(String.valueOf(result.get("intent_summary")).contains("Prices that need review"));
        assertFalse(String.valueOf(result.get("intent_summary")).contains("Opening the requested workflow"));
        verifyNoInteractions(chatClient, config, sanitizer, properties);
    }

    @Test
    void knownAmbiguousUtterancesResolveBeforeTheClassifier() {
        ChatClient chatClient = mock(ChatClient.class);
        IntentConfigService config = mock(IntentConfigService.class);
        IntentSanitizeService sanitizer = mock(IntentSanitizeService.class);
        AiProperties properties = mock(AiProperties.class);
        ClassifyQueryNode node = new ClassifyQueryNode(chatClient, config, sanitizer, properties);

        assertDeterministicResult(node, "Show me the pricing report for yesterday", "report_adhoc", "");
        assertDeterministicResult(node, "Show me the price suggestions from last week", "report_adhoc", "");
        assertDeterministicResult(node, "上周的价格建议有哪些", "report_adhoc", "");
        assertDeterministicResult(node, "Show me last week's pricing history", "report_adhoc", "");
        assertDeterministicResult(node, "Show me the price history for yesterday", "report_adhoc", "");
        assertDeterministicResult(node, "昨天的定价报告", "report_adhoc", "");
        assertDeterministicResult(node, "上周价格历史", "report_adhoc", "");
        assertDeterministicResult(node, "昨天价格历史", "report_adhoc", "");
        assertDeterministicResult(node, "发票还有吗？", "report_adhoc", "");
        assertDeterministicResult(node, "收到发票了吗？", "report_adhoc", "");
        assertDeterministicResult(node, "How many supplier bills did we receive?", "report_adhoc", "");
        assertDeterministicResult(node, "查看批量改价", "navigate", "/stock/bulk-price-edit");
        assertDeterministicResult(node, "Can you review prices for Shiraz?", "navigate", "/stock/capped-pricing");
        assertDeterministicResult(node, "Show me the price suggestions", "navigate", "/stock/capped-pricing");
        assertDeterministicResult(node, "给我看看价格建议", "navigate", "/stock/capped-pricing");
        assertDeterministicResult(node, "What do we need to buy?", "navigate", "/stock/replenishment");
        assertDeterministicResult(node, "Restock list please", "navigate", "/stock/replenishment");
        assertDeterministicResult(node, "哪些商品快没货", "navigate", "/stock/replenishment");
        assertDeterministicResult(node, "补货清单", "navigate", "/stock/replenishment");
        assertDeterministicResult(node, "Which prices need checking?", "navigate", "/stock/capped-pricing");
        assertDeterministicResult(node, "哪些价格需要复核", "navigate", "/stock/capped-pricing");
        assertDeterministicResult(node, "What should I top up?", "navigate", "/stock/replenishment");
        assertDeterministicResult(node, "What needs a reorder?", "navigate", "/stock/replenishment");
        assertDeterministicResult(node, "帮我看下哪些要补货", "navigate", "/stock/replenishment");
        assertDeterministicResult(node, "What is a fair price for Shiraz?", "navigate", "/stock/capped-pricing");
        assertDeterministicResult(node, "Which prices look off?", "navigate", "/stock/capped-pricing");
        assertDeterministicResult(node, "Snap this supplier invoice", "navigate", "/invoices/scan");
        assertDeterministicResult(node, "Red wine for steak", "navigate", "/sommelier");
        assertDeterministicResult(node, "红酒配牛排", "navigate", "/sommelier");

        verifyNoInteractions(chatClient, config, sanitizer, properties);
    }

    private static void assertDeterministicResult(
            ClassifyQueryNode node, String question, String expectedIntent, String expectedRoute) {
        OverAllState state = mock(OverAllState.class);
        when(state.value("question", String.class)).thenReturn(Optional.of(question));

        Map<String, Object> result = node.apply(state);

        assertEquals(expectedIntent, result.get("intent"), question);
        assertEquals(expectedRoute, result.get("ui_route"), question);
    }
}
