package com.orithos.modules.ai.report;

import org.junit.jupiter.api.Test;

import java.sql.Date;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ReportJsonCellsTest {

    @Test
    void sqlDateBecomesIsoDate() {
        Date d = Date.valueOf(LocalDate.of(2026, 8, 19));
        assertEquals("2026-08-19", ReportJsonCells.toJsonValue(d));
    }

    @Test
    void jacksonTypedDateArrayBecomesIsoDate() {
        long millis = Date.valueOf(LocalDate.of(2026, 8, 19)).getTime();
        Object raw = List.of("java.sql.Date", millis);
        assertEquals("2026-08-19", ReportJsonCells.toJsonValue(raw));
    }

    @Test
    void copyRowNormalizesDateColumn() {
        long millis = Date.valueOf(LocalDate.of(2026, 8, 19)).getTime();
        Map<String, Object> row = ReportJsonCells.copyRow(
                Map.of("d", List.of("java.sql.Date", millis), "qty", 6));
        assertEquals("2026-08-19", row.get("d"));
        assertEquals(6, row.get("qty"));
    }
}
