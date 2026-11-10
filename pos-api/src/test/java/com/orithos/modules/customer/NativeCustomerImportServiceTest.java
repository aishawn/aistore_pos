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
        when(jdbc.queryForObject(contains("INSERT INTO customer"), eq(Long.class), any(Object[].class)))
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
                        && call.getArgument(0, String.class).contains("INSERT INTO customer"))
                .findFirst().orElseThrow();
        Object[] values = (Object[]) insert.getRawArguments()[2];
        assertEquals(27, values.length);
        assertEquals("ABN-123", values[4]);
        assertEquals(LocalDate.parse("1990-01-02"), values[5]);
        assertEquals(0, values[12]);
        assertEquals("Invoice note", values[13]);
        assertEquals(1, values[17]);
        assertEquals(new BigDecimal("123.45"), values[24]);
        assertEquals(87L, values[26]);
        verify(jdbc).update(contains("INSERT INTO customer_email"), eq(321L), eq("primary@example.test"), eq(0), any(), eq(87L));
        verify(jdbc).update(contains("INSERT INTO customer_email"), eq(321L), eq("accounts@example.test"), eq(1), any(), eq(87L));
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
}
