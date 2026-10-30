package com.orithos.modules.ai.node;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.orithos.modules.ai.AiProperties;
import com.orithos.modules.ai.PosAssistantTools;
import com.orithos.modules.ai.configstore.IntentConfigService;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class GenerateResponseNodeTest {

    @Test
    void productCountAnswerUsesTheVerifiedCountWithoutCallingTheModel() {
        ChatClient chatClient = mock(ChatClient.class);
        IntentConfigService config = mock(IntentConfigService.class);
        AiProperties properties = mock(AiProperties.class);
        PosAssistantTools tools = mock(PosAssistantTools.class);
        OverAllState state = mock(OverAllState.class);
        String summary = "This store has 286 sellable products in the catalogue. Open Products to browse.";
        when(state.value("question", String.class)).thenReturn(Optional.of("How many products do we have?"));
        when(state.value("intent", String.class)).thenReturn(Optional.of("product_count"));
        when(state.value("intent_summary", String.class)).thenReturn(Optional.of(summary));

        GenerateResponseNode node = new GenerateResponseNode(chatClient, config, properties, tools);

        Map<String, Object> result = node.apply(state);

        assertEquals("This store has 286 sellable products in the catalogue.", result.get("answer"));
        verifyNoInteractions(chatClient, config, properties, tools);
    }

    @Test
    void productCountAnswerRemovesChineseNavigationPromptAndKeepsTheNumber() {
        OverAllState state = mock(OverAllState.class);
        when(state.value("question", String.class)).thenReturn(Optional.of("商品总数是多少？"));
        when(state.value("intent", String.class)).thenReturn(Optional.of("product_count"));
        when(state.value("intent_summary", String.class))
                .thenReturn(Optional.of("本店商品目录共有 4491 个可售商品。打开商品目录查看。"));

        GenerateResponseNode node = new GenerateResponseNode(null, null, null, null);

        assertEquals("本店商品目录共有 4491 个可售商品。", node.apply(state).get("answer"));
    }

    @Test
    void productCountAnswerWithoutNavigationPromptIsPreserved() {
        OverAllState state = mock(OverAllState.class);
        when(state.value("question", String.class)).thenReturn(Optional.of("How many products?"));
        when(state.value("intent", String.class)).thenReturn(Optional.of("product_count"));
        when(state.value("intent_summary", String.class))
                .thenReturn(Optional.of("This store has 0 sellable products in the catalogue."));

        GenerateResponseNode node = new GenerateResponseNode(null, null, null, null);

        assertEquals("This store has 0 sellable products in the catalogue.", node.apply(state).get("answer"));
    }

    @Test
    void missingProductCountSummaryReturnsLocalizedUnavailableInsteadOfGenericOk() {
        for (String[] sample : new String[][]{
                {"How many products are in the catalogue?", "Live product count is unavailable right now. Please try again shortly."},
                {"商品目录里有多少商品？", "暂时无法获取实时商品总数，请稍后重试。"}
        }) {
            OverAllState state = mock(OverAllState.class);
            when(state.value("question", String.class)).thenReturn(Optional.of(sample[0]));
            when(state.value("intent", String.class)).thenReturn(Optional.of("product_count"));
            when(state.value("intent_summary", String.class)).thenReturn(Optional.empty());

            GenerateResponseNode node = new GenerateResponseNode(null, null, null, null);

            assertEquals(sample[1], node.apply(state).get("answer"), sample[0]);
        }
    }

    @Test
    void historicalStockUnavailableUsesFixedAnswerWithoutCallingModelOrStockTools() {
        ChatClient chatClient = mock(ChatClient.class);
        IntentConfigService config = mock(IntentConfigService.class);
        AiProperties properties = mock(AiProperties.class);
        PosAssistantTools tools = mock(PosAssistantTools.class);
        OverAllState state = mock(OverAllState.class);
        String answer = "Stock reports show a live snapshot; historical stock is unavailable. Open the stock page to view current stock.";
        when(state.value("question", String.class)).thenReturn(Optional.of("and yesterday?"));
        when(state.value("intent", String.class)).thenReturn(Optional.of("qa"));
        when(state.value("intent_summary", String.class)).thenReturn(Optional.of(answer));
        when(state.value("fast_path_id", String.class)).thenReturn(Optional.of("historical_stock_unavailable"));

        GenerateResponseNode node = new GenerateResponseNode(chatClient, config, properties, tools);

        assertEquals(answer, node.apply(state).get("answer"));
        verifyNoInteractions(chatClient, config, properties, tools);
    }

    @Test
    void genericStockClarificationDoesNotCallTheModel() {
        ChatClient chatClient = mock(ChatClient.class);
        IntentConfigService config = mock(IntentConfigService.class);
        AiProperties properties = mock(AiProperties.class);
        PosAssistantTools tools = mock(PosAssistantTools.class);
        OverAllState state = mock(OverAllState.class);
        when(state.value("question", String.class))
                .thenReturn(Optional.of("Why can't I find anything in stock?"));
        when(state.value("intent", String.class)).thenReturn(Optional.of("qa"));
        when(state.value("intent_summary", String.class)).thenReturn(Optional.empty());

        GenerateResponseNode node = new GenerateResponseNode(chatClient, config, properties, tools);

        assertEquals("Please provide the exact product name or barcode, then open Stock or Replenishment to check the current store data. AI will not invent stock quantities.",
                node.apply(state).get("answer"));
        verifyNoInteractions(chatClient, config, properties, tools);
    }
}
