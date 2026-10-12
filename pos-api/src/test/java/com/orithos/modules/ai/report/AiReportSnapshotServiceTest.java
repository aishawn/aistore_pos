package com.orithos.modules.ai.report;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.ai.dto.ReportTable;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

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
}
