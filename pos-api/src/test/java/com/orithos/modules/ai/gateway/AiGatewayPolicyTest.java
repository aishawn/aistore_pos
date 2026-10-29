package com.orithos.modules.ai.gateway;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class AiGatewayPolicyTest {
    @Test
    void requiresTenantScopeAndNormalizesCorrelationId() {
        assertEquals("unknown", new AiTenantContext(1, 2, 3, " ").correlationId());
        assertThrows(IllegalArgumentException.class, () -> new AiTenantContext(0, 2, 3, "cid"));
    }

    @Test
    void rejectsControlFieldsAndSqlFromModelInput() {
        assertEquals("show stock", AiGatewayPolicy.validateInput(" show stock ", 100));
        assertThrows(IllegalArgumentException.class, () -> AiGatewayPolicy.validateInput("select * from products", 100));
        assertThrows(IllegalArgumentException.class, () -> AiGatewayPolicy.validateInput("change outletId=2", 100));
    }
}
