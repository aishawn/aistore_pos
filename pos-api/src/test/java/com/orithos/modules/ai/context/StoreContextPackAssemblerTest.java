package com.orithos.modules.ai.context;

import com.orithos.modules.ai.AiConversationMemory;
import com.orithos.modules.ai.report.NativeAiReportQueryService;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.vendor.VendorMapper;
import org.junit.jupiter.api.Test;

import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class StoreContextPackAssemblerTest {

    @Test
    void metadataOutageFallsBackToSafeContextAndKeepsPermissions() {
        VendorMapper vendors = mock(VendorMapper.class);
        NativeAiReportQueryService reports = mock(NativeAiReportQueryService.class);
        AiConversationMemory memory = mock(AiConversationMemory.class);
        when(vendors.findById(7L)).thenThrow(new RuntimeException("metadata unavailable"));
        when(reports.businessTimezone(org.mockito.ArgumentMatchers.any()))
                .thenThrow(new RuntimeException("native source unavailable"));
        when(memory.loadLastSlots("7:11:thread")).thenReturn(
                new AiConversationMemory.LastSlots("report_sales", Map.of("category", "beer")));

        StoreContextPackAssembler assembler = new StoreContextPackAssembler(vendors, reports, memory);
        TenantContext tenant = new TenantContext(7L, 11L, 3L, List.of(3L), Set.of("ROLE_ADMIN"));

        StoreContextPack pack = assembler.assemble(tenant, "7:11:thread", "Reports");

        assertEquals(7L, pack.vendorId());
        assertEquals("Australia/Melbourne", pack.businessTimezone());
        assertTrue(pack.canQueryReport());
        assertTrue(pack.canQueryCost());
        assertEquals("report_sales", pack.lastIntent());
        assertEquals("beer", pack.lastSlots().get("category"));
        assertEquals("reports", pack.surface());
    }

    @Test
    void nullTimezoneDoesNotEraseTheDefault() {
        VendorMapper vendors = mock(VendorMapper.class);
        NativeAiReportQueryService reports = mock(NativeAiReportQueryService.class);
        AiConversationMemory memory = mock(AiConversationMemory.class);
        when(vendors.findById(8L)).thenReturn(null);
        when(reports.businessTimezone(org.mockito.ArgumentMatchers.any())).thenReturn(null);

        StoreContextPack pack = new StoreContextPackAssembler(vendors, reports, memory)
                .assemble(new TenantContext(8L, 12L, 4L, List.of(4L), Set.of()), "8:12:thread", "sell");

        assertEquals(ZoneId.of("Australia/Melbourne").getId(), pack.businessTimezone());
    }
}
