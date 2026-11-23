package com.orithos.modules.ai.gateway;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.ai.AiProperties;
import com.orithos.modules.ai.configstore.IntentConfigService;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.support.StaticListableBeanFactory;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

class RemoteAiGatewayProviderHttpTest {

    @Test
    void sendsOpenAiCompatibleRequestAndParsesTextUsage() throws Exception {
        AtomicReference<String> requestBody = new AtomicReference<>();
        AtomicReference<String> authorization = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/provider/chat/completions", exchange -> {
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            byte[] response = """
                    {"choices":[{"message":{"content":"{\\"intent\\":\\"report_sales\\"}"}}],
                     "usage":{"prompt_tokens":12,"completion_tokens":4}}
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();
        try {
            AiGatewayProperties properties = new AiGatewayProperties();
            properties.setEnabled(true);
            properties.setServiceBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
            properties.setServiceToken("test-token");
            properties.setMaxRetries(0);
            properties.setFallbackModel("qwen-flash");
            AiProperties assistant = new AiProperties(true, "pos-assistant", null, null,
                    "qwen-flash", 0.1, 1024, 10, 6, 120);
            var factory = new StaticListableBeanFactory();
            RemoteAiGateway gateway = new RemoteAiGateway(factory.getBeanProvider(ChatClient.class), properties,
                    mock(AiGatewayQuotaService.class), mock(AiGatewayUsageRecorder.class),
                    new ObjectMapper(), assistant);

            AiCompletion<String> result = gateway.complete(new AiTenantContext(1, 1, 1, "cid"),
                    AiTask.CLASSIFICATION, new PromptVersion(IntentConfigService.PROMPT_CLASSIFY, "test", ""),
                    "classify this", String.class);

            assertEquals("{\"intent\":\"report_sales\"}", result.value());
            assertEquals(12, result.inputTokens());
            assertEquals(4, result.outputTokens());
            assertEquals("Bearer test-token", authorization.get());
            assertTrue(requestBody.get().contains("\"model\":\"qwen-flash\""));
            assertTrue(requestBody.get().contains("classify this"));

            gateway.completeMedia(new AiTenantContext(1, 1, 1, "cid"), AiTask.VISION,
                    "extract invoice fields", "image/jpeg", new byte[]{1, 2, 3}, null);
            var visionRequest = new ObjectMapper().readTree(requestBody.get());
            assertEquals("qwen3.8-flash", visionRequest.path("model").asText());
            assertTrue(visionRequest.path("parameters").path("enable_thinking").isBoolean());
            assertEquals(false, visionRequest.path("parameters").path("enable_thinking").asBoolean());
        } finally {
            server.stop(0);
        }
    }
}
