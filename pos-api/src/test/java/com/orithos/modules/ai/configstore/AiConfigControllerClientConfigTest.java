package com.orithos.modules.ai.configstore;

import com.orithos.modules.ai.AiTranscriptionService;
import com.orithos.modules.ai.PosAssistantGraphService;
import com.orithos.modules.ai.gateway.AiGatewayProperties;
import com.orithos.modules.ai.invoice.InvoiceVisionService;
import com.orithos.modules.ai.sommelier.WineLabelVisionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AiConfigControllerClientConfigTest {

    @Test
    @SuppressWarnings("unchecked")
    void clientConfigExposesNonSecretTranscriptionModelAndConfigIdentity() {
        IntentConfigService config = mock(IntentConfigService.class);
        when(config.getSnapshot()).thenReturn(IntentConfigService.Snapshot.empty());
        ObjectProvider<PosAssistantGraphService> graph = mock(ObjectProvider.class);
        ObjectProvider<AiTranscriptionService> transcription = mock(ObjectProvider.class);
        when(transcription.getIfAvailable()).thenReturn(mock(AiTranscriptionService.class));
        ObjectProvider<WineLabelVisionService> labelVision = mock(ObjectProvider.class);
        ObjectProvider<InvoiceVisionService> invoiceVision = mock(ObjectProvider.class);
        AiGatewayProperties gatewayProperties = new AiGatewayProperties();
        AiConfigController controller = new AiConfigController(
                mock(AiIntentMapper.class), mock(AiSlotMapper.class), mock(AiSlotValueMapper.class),
                mock(AiPromptMapper.class), config, graph, transcription, labelVision, invoiceVision,
                gatewayProperties, true);
        ReflectionTestUtils.setField(controller, "aiServiceBaseUrl", "https://ai.orithos.com.au");
        ReflectionTestUtils.setField(controller, "aiServiceToken", "configured");

        var data = controller.clientConfig().data();

        assertEquals("qwen3-asr-flash", data.get("transcriptionModel"));
        String configId = (String) data.get("transcriptionConfigId");
        assertTrue(configId.matches("sha256:[a-f0-9]{64}"));

        gatewayProperties.setTranscriptionModel("qwen3-asr-next");
        assertNotEquals(configId, controller.clientConfig().data().get("transcriptionConfigId"));
    }
}
