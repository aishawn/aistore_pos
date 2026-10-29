package com.orithos.modules.ai.command;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.ai.gateway.AiCompletion;
import com.orithos.modules.ai.gateway.AiGateway;
import com.orithos.modules.ai.gateway.AiTask;
import com.orithos.modules.ai.gateway.AiTenantContext;
import com.orithos.modules.ai.gateway.PromptVersion;
import com.orithos.modules.ai.report.TenantContext;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AiCommandParserTest {
    private final AiGateway gateway = mock(AiGateway.class);
    private final AiCommandParser parser = new AiCommandParser(gateway, new ObjectMapper());
    private final TenantContext tenant = new TenantContext(7, 11, 13L, List.of(13L), Set.of());

    @Test
    void parsesOnlyGatewayStructuredOutput() throws Exception {
        when(gateway.complete(eq(new AiTenantContext(7, 13, 11, "unknown")), eq(AiTask.COMMAND_PARSE),
                eq(new PromptVersion("ai-command-parser", "v1", "")), org.mockito.ArgumentMatchers.anyString(), eq(com.fasterxml.jackson.databind.JsonNode.class)))
                .thenReturn(new AiCompletion<>(new ObjectMapper().readTree("""
                        {"type":"UPDATE_PRODUCT","confidence":0.98,"summary":"rename one product",
                         "items":[{"id":123,"name":"VB Cans","field":"name","before":"VB Cans","after":"Victoria Bitter","reason":"exact match","status":"READY"}],
                         "changes":{"field":"name"},"excluded":[]}
                        """), "test", "test", 1, 1, Duration.ZERO, false));

        AiCommandService.Parsed parsed = parser.parse(tenant, "rename VB Cans to Victoria Bitter");

        assertEquals(AiCommandType.UPDATE_PRODUCT, parsed.type());
        assertEquals(123L, parsed.items().getFirst().id());
    }

    @Test
    void rejectsUnknownControlFields() throws Exception {
        when(gateway.complete(org.mockito.ArgumentMatchers.any(), eq(AiTask.COMMAND_PARSE),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString(), eq(com.fasterxml.jackson.databind.JsonNode.class)))
                .thenReturn(new AiCompletion<>(new ObjectMapper().readTree("""
                        {"type":"UPDATE_PRODUCT","confidence":0.98,"summary":"bad",
                         "tenantId":7,"items":[],"changes":{},"excluded":[]}
                        """), "test", "test", 1, 1, Duration.ZERO, false));

        assertThrows(com.orithos.common.BusinessException.class,
                () -> parser.parse(tenant, "change a product"));
    }
}
