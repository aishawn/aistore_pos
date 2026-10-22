package com.orithos.modules.ai;

import com.orithos.modules.ai.report.OdooReportQueryService;
import com.orithos.modules.ai.report.ReportPeriodResolver;
import com.orithos.modules.ai.report.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PosAssistantToolsTest {

    @AfterEach
    void clearTenant() {
        AssistantTenantContext.clear();
    }

    @Test
    void refusesWhenNoTenantBound() {
        PosAssistantTools tools = new PosAssistantTools(mock(OdooReportQueryService.class), new ReportPeriodResolver());
        assertTrue(tools.lookupSales("today", "today").startsWith("NO_STORE"));
    }

    @Test
    void stockRequiresProductName() {
        AssistantTenantContext.set(new TenantContext(1L, 2L, 3L, List.of(3L), Set.of("ROLE_ADMIN")));
        PosAssistantTools tools = new PosAssistantTools(mock(OdooReportQueryService.class), new ReportPeriodResolver());
        assertTrue(tools.lookupStock("  ").startsWith("NEED_PRODUCT"));
    }

    @Test
    void salesUsesTenantFromContextNotModelArgs() {
        TenantContext tenant = new TenantContext(9L, 8L, 7L, List.of(7L), Set.of("ROLE_ADMIN"));
        AssistantTenantContext.set(tenant);
        OdooReportQueryService query = mock(OdooReportQueryService.class);
        when(query.businessTimezone(tenant)).thenReturn(ZoneId.of("Australia/Adelaide"));
        when(query.query(eq(tenant), eq("report_sales"), any(), any()))
                .thenReturn(new OdooReportQueryService.Result(
                        List.of(Map.of("sales", "12.50", "day", "2026-10-20")), null));
        PosAssistantTools tools = new PosAssistantTools(query, new ReportPeriodResolver());
        String body = tools.lookupSales("2026-10-20", "2026-10-20");
        assertTrue(body.contains("12.50"));
    }

    @Test
    void countProductsUsesTenantContext() {
        TenantContext tenant = new TenantContext(9L, 8L, 7L, List.of(7L), Set.of("ROLE_ADMIN"));
        AssistantTenantContext.set(tenant);
        OdooReportQueryService query = mock(OdooReportQueryService.class);
        when(query.countSellableProducts(tenant)).thenReturn(42);
        PosAssistantTools tools = new PosAssistantTools(query, new ReportPeriodResolver());
        assertTrue(tools.countProducts().contains("42"));
    }

    @Test
    void searchProductsRequiresName() {
        AssistantTenantContext.set(new TenantContext(1L, 2L, 3L, List.of(3L), Set.of("ROLE_ADMIN")));
        PosAssistantTools tools = new PosAssistantTools(mock(OdooReportQueryService.class), new ReportPeriodResolver());
        assertTrue(tools.searchProducts(" ").startsWith("NEED_PRODUCT"));
    }
}
