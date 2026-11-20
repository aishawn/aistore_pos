package com.orithos.modules.ai.node;

import com.orithos.modules.ai.gateway.AiCompletion;
import com.orithos.modules.ai.gateway.AiGateway;
import com.orithos.modules.ai.gateway.AiTask;
import com.orithos.modules.ai.gateway.AiTenantContext;
import com.orithos.modules.ai.gateway.PromptVersion;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ClassifyQueryNodeGatewayTest {

    @Test
    void retriesInvalidTextAsStructuredOutputThroughGateway() {
        StubGateway gateway = new StubGateway();
        AiTenantContext tenant = new AiTenantContext(1L, 1L, 1L, "correlation");

        var result = ClassifyQueryNode.classifyThroughGateway(gateway, tenant, "classifier input");

        assertEquals("report_sales", result.intent());
        assertEquals("Sales summary", result.summary());
        assertEquals(2, gateway.calls);
    }

    @Test
    void parsesFencedJsonAndUnescapesClassifierFields() {
        StubGateway gateway = new StubGateway("Result:\n```json\n{\"intent\":\"report_sales\",\"summary\":\"Sales \\\"today\\\"\",\"query\":null}\n```");
        AiTenantContext tenant = new AiTenantContext(1L, 1L, 1L, "correlation");

        var result = ClassifyQueryNode.classifyThroughGateway(gateway, tenant, "classifier input");

        assertEquals("report_sales", result.intent());
        assertEquals("Sales \"today\"", result.summary());
        assertEquals(1, gateway.calls);
    }

    private static final class StubGateway implements AiGateway {
        private final String text;
        private int calls;

        private StubGateway() { this("not-json"); }
        private StubGateway(String text) { this.text = text; }

        @Override
        @SuppressWarnings("unchecked")
        public <T> AiCompletion<T> complete(AiTenantContext tenant, AiTask task, PromptVersion prompt,
                                            String input, Class<T> outputType) {
            calls++;
            if (task != AiTask.CLASSIFICATION) throw new AssertionError("Unexpected task");
            if (outputType == String.class) {
                return (AiCompletion<T>) completion(text);
            }
            if (outputType == ClassifyQueryNode.LlmIntentOutput.class) {
                return (AiCompletion<T>) completion(new ClassifyQueryNode.LlmIntentOutput(
                        "report_sales", "Sales summary", null, null, null, null, null, null, null,
                        "2026-11-18", "2026-11-18", null, null));
            }
            throw new AssertionError("Unexpected output type: " + outputType.getName());
        }

        private static <T> AiCompletion<T> completion(T value) {
            return new AiCompletion<>(value, "test", "test-model", 1, 1, Duration.ZERO, false);
        }
    }
}
