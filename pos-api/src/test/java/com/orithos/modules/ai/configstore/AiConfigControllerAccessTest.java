package com.orithos.modules.ai.configstore;

import com.orithos.common.BusinessException;
import com.orithos.modules.ai.AiTranscriptionService;
import com.orithos.modules.ai.PosAssistantGraphService;
import com.orithos.modules.ai.gateway.AiGatewayProperties;
import com.orithos.modules.ai.invoice.InvoiceVisionService;
import com.orithos.modules.ai.sommelier.WineLabelVisionService;
import com.orithos.security.AuthUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

class AiConfigControllerAccessTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @SuppressWarnings("unchecked")
    void nonAdminCannotMutateSharedAiConfiguration() {
        AiIntentMapper intents = mock(AiIntentMapper.class);
        AiSlotMapper slots = mock(AiSlotMapper.class);
        AiSlotValueMapper values = mock(AiSlotValueMapper.class);
        AiPromptMapper prompts = mock(AiPromptMapper.class);
        IntentConfigService config = mock(IntentConfigService.class);
        ObjectProvider<PosAssistantGraphService> graph = mock(ObjectProvider.class);
        ObjectProvider<AiTranscriptionService> transcription = mock(ObjectProvider.class);
        ObjectProvider<WineLabelVisionService> labelVision = mock(ObjectProvider.class);
        ObjectProvider<InvoiceVisionService> invoiceVision = mock(ObjectProvider.class);
        AiConfigController controller = new AiConfigController(
                intents, slots, values, prompts, config, graph, transcription, labelVision, invoiceVision,
                new AiGatewayProperties(), false);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        new AuthUser(7L, "clerk", false, 1L, 2L), null, List.of()));

        assertAll(
                () -> assertForbidden(controller::reload),
                () -> assertForbidden(() -> controller.createIntent(new AiIntent())),
                () -> assertForbidden(() -> controller.updateIntent(1L, new AiIntent())),
                () -> assertForbidden(() -> controller.deleteIntent(1L)),
                () -> assertForbidden(() -> controller.createSlot(new AiSlot())),
                () -> assertForbidden(() -> controller.updateSlot(1L, new AiSlot())),
                () -> assertForbidden(() -> controller.deleteSlot(1L)),
                () -> assertForbidden(() -> controller.createSlotValue(new AiSlotValue())),
                () -> assertForbidden(() -> controller.updateSlotValue(1L, new AiSlotValue())),
                () -> assertForbidden(() -> controller.deleteSlotValue(1L)),
                () -> assertForbidden(() -> controller.createPrompt(new AiPrompt())),
                () -> assertForbidden(() -> controller.updatePrompt(1L, new AiPrompt())),
                () -> assertForbidden(() -> controller.deletePrompt(1L))
        );
    }

    private static void assertForbidden(org.junit.jupiter.api.function.Executable action) {
        BusinessException exception = assertThrows(BusinessException.class, action);
        assertEquals(40300, exception.getCode());
    }
}
