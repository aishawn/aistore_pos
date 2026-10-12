package com.orithos.modules.ai.report;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiReportTenantSchemaTest {

    @Test
    void namesSchemaAndUserByOutletId() {
        assertEquals("orithos_o12", AiReportTenantSchema.schemaName(12L));
        assertEquals("orithos_ai_ro_o15", AiReportTenantSchema.username("orithos_ai_ro", 15L));
    }

    @Test
    void rewritesJdbcUrlDatabase() {
        String url = "jdbc:mysql://localhost:3306/orithos?useUnicode=true";
        assertEquals("jdbc:mysql://localhost:3306/orithos_o12?useUnicode=true",
                AiReportTenantSchema.jdbcUrl(url, 12L));
    }

    @Test
    void rejectsNonPositiveOutlet() {
        assertThrows(SqlGuardException.class, () -> AiReportTenantSchema.schemaName(0));
    }
}
