package com.orithos.modules.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.sql.ResultSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ShopfrontNativeSaleImporterTest {

    @Test
    void mapsShopfrontStatusesOntoNativeLedgerStatuses() {
        assertEquals("COMPLETED", ShopfrontNativeSaleImporter.mapStatus("COMPLETED"));
        assertEquals("COMPLETED", ShopfrontNativeSaleImporter.mapStatus("closed"));
        assertEquals("INCOMPLETE", ShopfrontNativeSaleImporter.mapStatus("INCOMPLETE"));
        assertEquals("PARKED", ShopfrontNativeSaleImporter.mapStatus("PARKED"));
        assertEquals("VOIDED", ShopfrontNativeSaleImporter.mapStatus("cancelled"));
        assertThrows(IllegalArgumentException.class, () -> ShopfrontNativeSaleImporter.mapStatus(null));
        assertThrows(IllegalArgumentException.class, () -> ShopfrontNativeSaleImporter.mapStatus("mystery"));
    }

    @Test
    void parsesAdelaideBusinessDateFromUtcInstant() {
        var soldAt = ShopfrontNativeSaleImporter.parseSoldAt("2026-11-09T14:30:00Z");
        assertNotNull(soldAt);
        assertEquals(LocalDate.of(2026, 11, 10), soldAt.businessDate());
    }

    @Test
    void mirrorPromotionIsDisabledAndDoesNotReadPosMirrorTables() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var importer = new ShopfrontNativeSaleImporter(jdbc);

        assertThrows(UnsupportedOperationException.class,
                () -> importer.promoteFromMirror("demo", 1L, null, 40, "2026-11-10"));

        verify(jdbc, never()).queryForList(contains("shopfront_sale"), any(Object[].class));
        verify(jdbc, never()).queryForList(contains("shopfront_sale_item"), any(Object[].class));
        verify(jdbc, never()).queryForList(contains("shopfront_sale_payment"), any(Object[].class));
    }

    @Test
    void upsertsNativeSaleWithoutStockMovement() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("shopfront_product_mapping"), any(Object[].class)))
                .thenReturn(java.util.List.of());
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(Object[].class)))
                .thenAnswer(invocation -> {
                    String sql = invocation.getArgument(0);
                    if (sql.contains("INSERT INTO sale")) {
                        return 99L;
                    }
                    throw new org.springframework.dao.EmptyResultDataAccessException(1);
                });

        var importer = new ShopfrontNativeSaleImporter(jdbc);
        var payload = new ObjectMapper().readTree("""
                [{"external_id":"sf-1","invoice_id":"INV-1","status":"COMPLETED",
                  "created_at":"2026-11-09T03:15:00Z","total_price":12.50,"total_tax":1.14,"total_cost":7.00,
                  "items":[{"id":"line-1","source_product_id":"p-1","name":"Test Wine","quantity":1,
                            "unit_price":12.50,"line_total":12.50,"cost":7.00,"tax":1.14}],
                  "payments":[{"id":"pay-1","amount":12.50,"status":"COMPLETED","subtype":"CARD"}]}]
                """);

        var result = importer.upsertSales("skr", 87L, payload);

        assertEquals(1, result.get("created"));
        assertEquals(0, result.get("updated"));
        assertEquals(1, result.get("unmatched_lines"));
        verify(jdbc).update(contains("external_line_id"), any(Object[].class));
        verify(jdbc).update(contains("external_payment_id"), any(Object[].class));
        verify(jdbc, never()).update(contains("inventory_movement"), any(Object[].class));
        verify(jdbc, never()).update(contains("product_inventory"), any(Object[].class));
    }

    @Test
    void resolvesCustomerReferenceFromNativeClientIdMapping() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("shopfront_product_mapping"), any(Object[].class)))
                .thenReturn(java.util.List.of());
        doAnswer(invocation -> {
            RowCallbackHandler callback = invocation.getArgument(1);
            ResultSet row = mock(ResultSet.class);
            when(row.next()).thenReturn(true, false);
            when(row.getString("reference")).thenReturn("client-customer-1");
            when(row.getLong("customer_id")).thenReturn(321L);
            callback.processRow(row);
            return null;
        }).when(jdbc).query(contains("client_id AS reference"), any(RowCallbackHandler.class), any(Object[].class));
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(Object[].class)))
                .thenAnswer(invocation -> invocation.getArgument(0, String.class).contains("INSERT INTO sale")
                        ? 99L : null);

        var payload = new ObjectMapper().readTree("""
                [{"external_id":"sf-customer-sale","invoice_id":"INV-2","status":"COMPLETED",
                  "customer_reference":"client-customer-1","created_at":"2026-11-09T03:15:00Z",
                  "total_price":12.50,"total_tax":1.14,"items":[]}]
                """);

        var result = new ShopfrontNativeSaleImporter(jdbc).upsertSales("skr", 87L, payload);

        assertEquals(1, result.get("created"));
        var saleInsert = org.mockito.Mockito.mockingDetails(jdbc).getInvocations().stream()
                .filter(call -> call.getMethod().getName().equals("queryForObject")
                        && call.getArgument(0, String.class).contains("INSERT INTO sale"))
                .findFirst().orElseThrow();
        Object[] values = (Object[]) saleInsert.getRawArguments()[2];
        assertEquals(321L, values[4]);
    }

    @Test
    void skipsSalesWithUnknownStatusBeforeWritingLedgerRows() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("shopfront_product_mapping"), any(Object[].class)))
                .thenReturn(java.util.List.of());
        var importer = new ShopfrontNativeSaleImporter(jdbc);
        var payload = new ObjectMapper().readTree("""
                [{"external_id":"sf-bad","status":"mystery","created_at":"2026-11-09T03:15:00Z",
                  "total_price":12.50,"total_tax":1.14,"items":[]}]
                """);

        var result = importer.upsertSales("skr", 87L, payload);

        assertEquals(1, result.get("skipped"));
        assertEquals(0, result.get("created"));
        verify(jdbc, never()).update(contains("INSERT INTO sale"), any(Object[].class));
    }
}
