package com.orithos.modules.ai.node;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.orithos.modules.ai.AiProperties;
import com.orithos.modules.ai.configstore.IntentConfigService;
import com.orithos.modules.ai.configstore.IntentSanitizeService;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ClassifyQueryNodeTest {

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
}
