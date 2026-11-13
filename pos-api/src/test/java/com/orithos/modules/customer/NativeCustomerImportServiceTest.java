package com.orithos.modules.customer;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.mockito.invocation.Invocation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockingDetails;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NativeCustomerImportServiceTest {

    @Test
    void importsCustomerBusinessFieldsAndAllEmailsIntoNativeRows() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenReturn(List.of());
        when(jdbc.queryForObject(contains("INSERT INTO customer_group"), eq(Long.class), any(Object[].class)))
                .thenReturn(55L);
        when(jdbc.queryForObject(contains("INSERT INTO price_list"), eq(Long.class), any(Object[].class)))
                .thenReturn(88L);
        when(jdbc.queryForObject(contains("INSERT INTO customer ("), eq(Long.class), any(Object[].class)))
                .thenReturn(321L);
        ObjectMapper mapper = new ObjectMapper();
        var items = mapper.readTree("""
                [{
                  "source_id":"sf-customer-1",
                  "name":"A Customer",
                  "code":"AC-1",
                  "email":"primary@example.test",
                  "phone":"0412000000",
                  "mobile":"0412111111",
                  "raw_payload":{
                    "firstName":"A",
                    "lastName":"Customer",
                    "businessNumber":"ABN-123",
                    "birthday":"1990-01-02",
                    "gender":"female",
                    "emails":["primary@example.test","accounts@example.test"],
                    "fax":"0290000000",
                    "allowMarketingEmails":false,
                    "invoiceMessage":"Invoice note",
                    "comments":"Customer note",
                    "loyaltyEnabled":true,
                    "loyaltyRate":2.5,
                    "loyaltyPoints":17,
                    "disablePromotions":true,
                    "requireOrderReference":true,
                    "accountLimit":500,
                    "currentOwing":123.45,
                    "customerGroup":{"id":"group-1","name":"Wholesale"},
                    "priceList":{"id":"list-1","name":"Trade"}
                  }
                }]
                """);

        var receipt = new NativeCustomerImportService(jdbc).importCustomers("skr", 87, items);

        assertEquals(1, receipt.get("created"));
        assertEquals(0, receipt.get("skipped"));
        Invocation insert = mockingDetails(jdbc).getInvocations().stream()
                .filter(call -> call.getMethod().getName().equals("queryForObject")
                        && call.getArgument(0, String.class).contains("INSERT INTO customer ("))
                .findFirst().orElseThrow();
        Object[] values = (Object[]) insert.getRawArguments()[2];
        assertEquals(27, values.length);
        assertEquals("ABN-123", values[4]);
        assertEquals(LocalDate.parse("1990-01-02"), values[5]);
        assertEquals(0, values[12]);
        assertEquals("Invoice note", values[13]);
        assertEquals(55L, values[15]);
        assertEquals(1, values[17]);
        assertEquals(new BigDecimal("123.45"), values[24]);
        assertEquals(87L, values[26]);
        verify(jdbc).update(contains("INSERT INTO customer_email"), eq(321L), eq("primary@example.test"), eq(0), any(), eq(87L));
        verify(jdbc).update(contains("INSERT INTO customer_email"), eq(321L), eq("accounts@example.test"), eq(1), any(), eq(87L));
    }

    @Test
    void importsCustomerGroupCatalogIncludingEmptyGroups() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenReturn(List.of());
        when(jdbc.queryForObject(contains("INSERT INTO customer_group"), eq(Long.class), any(Object[].class)))
                .thenReturn(701L, 702L);
        var items = new ObjectMapper().readTree("""
                [
                  {"source_id":"g1","name":"Staff Group"},
                  {"source_id":"g2","name":"Out of Dates"}
                ]
                """);

        var receipt = new NativeCustomerImportService(jdbc).importCustomerGroups("skr", 87, items);

        assertEquals(2, receipt.get("created"));
        assertEquals(0, receipt.get("skipped"));
        assertEquals(true, receipt.get("enabled"));
        verify(jdbc).update(contains("INSERT INTO shopfront_customer_group_mapping"),
                eq("skr"), eq("g1"), eq(87L), eq(701L));
        verify(jdbc).update(contains("INSERT INTO shopfront_customer_group_mapping"),
                eq("skr"), eq("g2"), eq(87L), eq(702L));
    }

    @Test
    void importsPriceListCatalogWithRulesAndProductMapping() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenAnswer(call -> {
            String sql = call.getArgument(0, String.class);
            if (sql.contains("FROM shopfront_product_mapping")) return List.of(9001L);
            return List.of();
        });
        when(jdbc.queryForObject(contains("INSERT INTO price_list"), eq(Long.class), any(Object[].class)))
                .thenReturn(501L);
        var items = new ObjectMapper().readTree("""
                [{
                  "source_id":"pl-1",
                  "name":"Staff discounts",
                  "allowHigherPrice":true,
                  "allowDiscountingPromotions":false,
                  "items":[{
                    "exclude":false,
                    "rule":"FIXED",
                    "amount":9.99,
                    "item":{"__typename":"Product","id":"sf-product-1","name":"Wine"}
                  }]
                }]
                """);

        var receipt = new NativeCustomerImportService(jdbc).importPriceLists("skr", 87, items);

        assertEquals(1, receipt.get("created"));
        assertEquals(0, receipt.get("skipped"));
        assertEquals(1, receipt.get("item_rows"));
        assertEquals(0, receipt.get("unmatched_items"));
        assertEquals(true, receipt.get("enabled"));
        verify(jdbc).update(contains("INSERT INTO shopfront_price_list_mapping"),
                eq("skr"), eq("pl-1"), eq(87L), eq(501L));
        verify(jdbc).update(contains("INSERT INTO price_list_item"),
                eq(501L), eq("PRODUCT"), eq(9001L), eq(0), eq("FIXED"), eq(new BigDecimal("9.99")), eq(87L));
    }

    @Test
    void createsCustomerMappingTableBeforeResolvingHistoricalPaymentCustomer() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenAnswer(call -> {
            String sql = call.getArgument(0, String.class);
            return sql.contains("SELECT customer_id FROM shopfront_customer_mapping") ? List.of(321L) : List.of();
        });
        when(jdbc.queryForObject(contains("INSERT INTO customer_payment"), eq(Long.class), any(Object[].class)))
                .thenReturn(654L);
        var items = new ObjectMapper().readTree("""
                [{"source_id":"sf-payment-without-customer-import","raw_payload":{
                  "amount":25.50,"timestamp":"2026-11-09T12:30:00+10:30",
                  "customer":{"id":"sf-customer-1"}
                }}]
                """);

        var receipt = new NativeCustomerImportService(jdbc).importPayments("skr", 87, items);

        assertEquals(1, receipt.get("created"));
        assertEquals(0, receipt.get("skipped"));
        verify(jdbc).execute(contains("CREATE TABLE IF NOT EXISTS shopfront_customer_mapping"));
    }

    @Test
    void importsHistoricalCustomerPaymentsIdempotentlyWithoutTouchingOwing() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenAnswer(call -> {
            String sql = call.getArgument(0, String.class);
            return sql.contains("SELECT customer_id FROM shopfront_customer_mapping") ? List.of(321L) : List.of();
        });
        when(jdbc.queryForObject(contains("INSERT INTO customer_payment"), eq(Long.class), any(Object[].class)))
                .thenReturn(654L);
        var items = new ObjectMapper().readTree("""
                [{"source_id":"sf-payment-7","raw_payload":{
                  "amount":25.50,"rounding":0.01,"startBalance":80.00,
                  "timestamp":"2026-11-09T12:30:00+10:30","reference":"RCPT-7",
                  "status":"COMPLETED","customer":{"id":"sf-customer-1"},
                  "paymentMethod":{"name":"Cash"}
                }}]
                """);

        var receipt = new NativeCustomerImportService(jdbc).importPayments("skr", 87, items);

        assertEquals(1, receipt.get("created"));
        assertEquals(0, receipt.get("skipped"));
        verify(jdbc).queryForObject(contains("INSERT INTO customer_payment"), eq(Long.class),
                eq(321L), eq(null), eq("RCPT-7"), eq("COMPLETED"), eq(new BigDecimal("80.0")),
                eq(new BigDecimal("25.5")), eq(new BigDecimal("0.01")),
                eq(LocalDateTime.parse("2026-11-09T12:30:00")), eq(null), eq(87L));
        verify(jdbc).update(contains("INSERT INTO shopfront_customer_payment_mapping"), eq("skr"), eq("sf-payment-7"), eq(87L), eq(654L));
    }

    @Test
    void importsHistoricalCustomerPaymentsWithCompactUtcOffset() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenAnswer(call -> {
            String sql = call.getArgument(0, String.class);
            return sql.contains("SELECT customer_id FROM shopfront_customer_mapping") ? List.of(321L) : List.of();
        });
        when(jdbc.queryForObject(contains("INSERT INTO customer_payment"), eq(Long.class), any(Object[].class)))
                .thenReturn(654L);
        var items = new ObjectMapper().readTree("""
                [{"source_id":"sf-payment-utc","raw_payload":{
                  "amount":59.99,"timestamp":"2024-01-16T09:46:19+0000",
                  "cancelledAt":"2024-01-17T14:33:05+0000",
                  "status":"CANCELLED","customer":{"id":"sf-customer-1"},
                  "paymentMethod":{"name":"Cash"}
                }}]
                """);

        var receipt = new NativeCustomerImportService(jdbc).importPayments("skr", 87, items);

        assertEquals(1, receipt.get("created"));
        assertEquals(0, receipt.get("skipped"));
        verify(jdbc).queryForObject(contains("INSERT INTO customer_payment"), eq(Long.class),
                eq(321L), eq(null), eq(null), eq("VOIDED"), eq(null),
                eq(new BigDecimal("59.99")), eq(null),
                eq(LocalDateTime.parse("2024-01-16T09:46:19")),
                eq(LocalDateTime.parse("2024-01-17T14:33:05")), eq(87L));
    }

    @Test
    void importsCompactCustomerPaymentFieldsFromCrawlerBoundary() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenAnswer(call -> {
            String sql = call.getArgument(0, String.class);
            if (sql.contains("SELECT customer_id FROM shopfront_customer_mapping")) return List.of(321L);
            if (sql.contains("SELECT id FROM payment_method")) return List.of(987L);
            return List.of();
        });
        when(jdbc.queryForObject(contains("INSERT INTO customer_payment"), eq(Long.class), any(Object[].class)))
                .thenReturn(654L);
        var items = new ObjectMapper().readTree("""
                [{"source_id":"sf-payment-compact","customer_source_id":"sf-customer-1",
                  "payment_method_name":"Cash","amount":"25.50",
                  "timestamp":"2026-11-09T12:30:00+10:30","reference":"RCPT-compact"}]
                """);

        var receipt = new NativeCustomerImportService(jdbc).importPayments("skr", 87, items);

        assertEquals(1, receipt.get("created"));
        assertEquals(0, receipt.get("skipped"));
        verify(jdbc).queryForObject(contains("INSERT INTO customer_payment"), eq(Long.class),
                eq(321L), eq(987L), eq("RCPT-compact"), eq("COMPLETED"), eq(null),
                eq(new BigDecimal("25.50")), eq(null),
                eq(LocalDateTime.parse("2026-11-09T12:30:00")), eq(null), eq(87L));
    }
}
