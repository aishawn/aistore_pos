package com.orithos.modules.ai.node;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatOptions;
import com.orithos.modules.ai.AiProperties;
import com.orithos.modules.ai.configstore.IntentConfigService;
import com.orithos.modules.ai.configstore.IntentSanitizeService;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
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

            assertEquals("unknown", result.get("intent"), question);
            assertEquals("", result.get("ui_route"), question);
        }

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
