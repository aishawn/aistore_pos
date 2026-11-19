package com.orithos.modules.ai.gateway;

import com.orithos.modules.ai.AiProperties;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RemoteAiGatewayModelRoutingTest {

    @Test
    void usesConfiguredClassificationModelThenFallsBackToPrimaryModel() {
        AiGatewayProperties gateway = new AiGatewayProperties();
        gateway.setPrimaryModel("qwen-plus");
        gateway.setFallbackModel("qwen-flash");
        AiProperties assistant = properties("qwen-flash");

        assertEquals("qwen-flash", RemoteAiGateway.modelFor(AiTask.CLASSIFICATION, false, gateway, assistant));
        assertEquals("qwen-plus", RemoteAiGateway.modelFor(AiTask.CLASSIFICATION, true, gateway, assistant));
    }

    @Test
    void usesGatewayFallbackWhenClassificationModelIsNotConfigured() {
        AiGatewayProperties gateway = new AiGatewayProperties();
        gateway.setPrimaryModel("qwen-plus");
        gateway.setFallbackModel("qwen-flash");

        assertEquals("qwen-flash", RemoteAiGateway.modelFor(AiTask.CLASSIFICATION, false, gateway, properties("")));
        assertEquals("qwen-plus", RemoteAiGateway.modelFor(AiTask.CLASSIFICATION, true, gateway, properties("")));
    }

    @Test
    void keepsPrimaryModelForNonClassificationTasks() {
        AiGatewayProperties gateway = new AiGatewayProperties();
        gateway.setPrimaryModel("qwen-plus");
        gateway.setFallbackModel("qwen-flash");

        assertEquals("qwen-plus", RemoteAiGateway.modelFor(AiTask.RESPONSE, false, gateway, properties("qwen-mini")));
        assertEquals("qwen-flash", RemoteAiGateway.modelFor(AiTask.RESPONSE, true, gateway, properties("qwen-mini")));
    }

    private static AiProperties properties(String classifyModel) {
        return new AiProperties(true, "pos-assistant", "qwen3-asr-flash", "qwen-vl-plus", classifyModel,
                0.1, 512, 20, 6, 120);
    }
}
