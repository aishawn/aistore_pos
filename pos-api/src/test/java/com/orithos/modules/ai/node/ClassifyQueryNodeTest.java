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
}
