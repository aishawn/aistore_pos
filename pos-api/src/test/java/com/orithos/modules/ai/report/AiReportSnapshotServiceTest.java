package com.orithos.modules.ai.report;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.modules.ai.dto.ReportTable;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.eq;

class AiReportSnapshotServiceTest {

    @Test
    void payloadRoundTripKeepsRowsAndSlots() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        AiReportSnapshotService.Payload payload = new AiReportSnapshotService.Payload(
                List.of("id", "name", "quantity"),
                List.of(Map.of("id", 28, "name", "Orithos Test Coca Cola 375ml", "quantity", 200)),
                Map.of("query", "Coca Cola")
        );
        String json = mapper.writeValueAsString(payload);
        AiReportSnapshotService.Payload back = mapper.readValue(json, AiReportSnapshotService.Payload.class);
        assertNotNull(back);
        assertEquals(List.of("id", "name", "quantity"), back.columns());
        assertEquals("Orithos Test Coca Cola 375ml", back.rows().get(0).get("name"));
        assertEquals("Coca Cola", back.slots().get("query"));
        ReportTable table = new ReportTable(back.columns(), back.rows());
        assertEquals(1, table.rows().size());
    }

    @Test
    void saveBindsVendorUserAndOutletToSnapshot() {
        AiReportSnapshotMapper snapshots = mock(AiReportSnapshotMapper.class);
        when(snapshots.insert(any())).thenAnswer(invocation -> {
            AiReportSnapshot row = invocation.getArgument(0);
            row.setId(91L);
            return 1;
        });
        AiReportSnapshotService service = new AiReportSnapshotService(snapshots, new ObjectMapper());
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), java.util.Set.of());

        Long id = service.save(tenant, "report_sales", "Sales today", "Sales today",
                new ReportTable(List.of("sales"), List.of(Map.of("sales", 12))), Map.of());

        assertEquals(91L, id);
        verify(snapshots).insert(org.mockito.ArgumentMatchers.argThat(row ->
                row.getVendorId() == 42L && row.getUserId() == 7L && Long.valueOf(3L).equals(row.getOutletId())));
    }

    @Test
    void getOwnedRejectsMissingTenantInsteadOfThrowingNullPointerException() {
        AiReportSnapshotMapper snapshots = mock(AiReportSnapshotMapper.class);
        AiReportSnapshotService service = new AiReportSnapshotService(snapshots, new ObjectMapper());

        BusinessException error = assertThrows(BusinessException.class, () -> service.getOwned(91L, null));

        assertEquals(40100, error.getCode());
    }

    @Test
    void getOwnedQueriesBothVendorAndUserOwnerKeys() {
        AiReportSnapshotMapper snapshots = mock(AiReportSnapshotMapper.class);
        AiReportSnapshotService service = new AiReportSnapshotService(snapshots, new ObjectMapper());
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), java.util.Set.of());
        when(snapshots.findByIdAndOwner(91L, 42L, 7L)).thenReturn(null);

        BusinessException error = assertThrows(BusinessException.class, () -> service.getOwned(91L, tenant));

        assertEquals(40401, error.getCode());
        verify(snapshots).findByIdAndOwner(eq(91L), eq(42L), eq(7L));
    }
}
