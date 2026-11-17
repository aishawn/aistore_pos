package com.orithos.modules.ai.report;

import org.junit.jupiter.api.Test;

import java.util.Arrays;

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
        String url = "jdbc:postgresql://localhost:5432/orithos?sslmode=disable";
        assertEquals("jdbc:postgresql://localhost:5432/orithos?sslmode=disable&currentSchema=orithos_o12",
                AiReportTenantSchema.jdbcUrl(url, 12L));
    }

    @Test
    void rejectsNonPositiveOutlet() {
        assertThrows(SqlGuardException.class, () -> AiReportTenantSchema.schemaName(0));
    }

    @Test
    void provisionsTheMinimalProductCountViewForEachOutlet() {
        assertTrue(Arrays.asList(AiReportTenantProvisioner.VIEWS).contains("ai_rpt_product_count"));
        assertTrue(Arrays.asList(AiReportTenantProvisioner.VIEWS).contains("ai_rpt_product_barcode"));
        assertTrue(Arrays.asList(AiReportTenantProvisioner.VIEWS).contains("ai_rpt_product_core"));
    }
}
