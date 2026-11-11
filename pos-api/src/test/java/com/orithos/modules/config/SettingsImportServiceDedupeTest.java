package com.orithos.modules.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.payment.PaymentMethodMapper;
import com.orithos.modules.register.RegisterMapper;
import com.orithos.modules.tax.TaxRateMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SettingsImportServiceDedupeTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final TaxRateMapper taxRates = mock(TaxRateMapper.class);
    private final PaymentMethodMapper paymentMethods = mock(PaymentMethodMapper.class);
    private final RegisterMapper registers = mock(RegisterMapper.class);
    private SettingsImportService service;

    @BeforeEach
    void setUp() {
        service = new SettingsImportService(
                jdbc,
                new ObjectMapper(),
                taxRates,
                paymentMethods,
                registers);
    }

    @Test
    void dedupeOnlyReassignsRecordsInsideTheMappedOutlet() {
        when(jdbc.queryForList(contains("FROM tax_rate"), any(Object[].class))).thenReturn(List.of(
                Map.of("id", 1L, "name", "GST"),
                Map.of("id", 9L, "name", "gst")));
        when(jdbc.queryForList(contains("FROM payment_method"), any(Object[].class))).thenReturn(List.of(
                Map.of("id", 3L, "name", "Cash"),
                Map.of("id", 11L, "name", "CASH")));

        Map<String, Object> result = service.dedupeCatalogues(87L);

        assertEquals(1, result.get("tax_rates_removed"));
        assertEquals(1, result.get("payment_methods_removed"));
        verify(jdbc).update(contains("UPDATE product SET tax_rate_id"), eq(1L), eq(87L), eq(9L));
        verify(jdbc).update(contains("UPDATE sale_payment SET payment_method_id"), eq(3L), eq(87L), eq(11L));
        verify(jdbc).update(contains("UPDATE tax_rate SET deleted_at"), eq(9L), eq(87L));
        verify(jdbc).update(contains("UPDATE payment_method SET deleted_at"), eq(11L), eq(87L));
    }
}
