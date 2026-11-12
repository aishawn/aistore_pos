package com.orithos.modules.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.payment.PaymentMethod;
import com.orithos.modules.payment.PaymentMethodMapper;
import com.orithos.modules.register.RegisterMapper;
import com.orithos.modules.tax.TaxRate;
import com.orithos.modules.tax.TaxRateMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SettingsImportServiceTaxTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final TaxRateMapper taxRates = mock(TaxRateMapper.class);
    private final PaymentMethodMapper paymentMethods = mock(PaymentMethodMapper.class);
    private final RegisterMapper registers = mock(RegisterMapper.class);
    private SettingsImportService service;

    @BeforeEach
    void setUp() {
        service = new SettingsImportService(jdbc, new ObjectMapper(), taxRates, paymentMethods, registers);
        when(jdbc.queryForList(contains("SELECT name FROM tax_rate"), eq(String.class), eq(87L)))
                .thenReturn(List.of());
        when(jdbc.queryForList(contains("SELECT name FROM payment_method"), eq(String.class), eq(87L)))
                .thenReturn(List.of());
        when(jdbc.queryForList(contains("SELECT id, name FROM tax_rate"), any(Object[].class)))
                .thenReturn(List.of());
        when(jdbc.queryForList(contains("SELECT id, name FROM payment_method"), any(Object[].class)))
                .thenReturn(List.of());
        when(taxRates.findAllActiveAsc(87L)).thenReturn(List.of());
        when(registers.findByOutletId(87L)).thenReturn(List.of());
    }

    @Test
    void importsExplicitTaxAmountAndSkipsMissingAmountInsteadOfInventingTenPercent() throws Exception {
        var catalogues = new ObjectMapper().readTree("""
                {
                  "tax_rates": [
                    {"name":"Explicit","amount":7.5},
                    {"name":"Missing"},
                    {"name":"Null","amount":null},
                    {"name":"From rate alias","rate":0}
                  ]
                }
                """);

        Map<String, Object> result = service.promote("skr", 87L, false, catalogues);

        @SuppressWarnings("unchecked")
        Map<String, Object> counts = (Map<String, Object>) result.get("counts");
        assertEquals(2, counts.get("tax_rates"));
        assertEquals(2, counts.get("tax_rates_skipped_missing_amount"));
        verify(taxRates).insert(org.mockito.ArgumentMatchers.argThat(rate ->
                "Explicit".equals(rate.getName()) && new BigDecimal("7.5").compareTo(rate.getAmount()) == 0));
        verify(taxRates).insert(org.mockito.ArgumentMatchers.argThat(rate ->
                "From rate alias".equals(rate.getName()) && BigDecimal.ZERO.compareTo(rate.getAmount()) == 0));
    }

    @Test
    void updatesExistingRateAmountsAndSourceDefault() throws Exception {
        TaxRate excluding = rate(208L, "Excluding GST", new BigDecimal("10"), false);
        TaxRate gst = rate(204L, "GST", new BigDecimal("10"), false);
        when(taxRates.findByNameIgnoreCase("Excluding GST", 87L)).thenReturn(excluding);
        when(taxRates.findByNameIgnoreCase("GST", 87L)).thenReturn(gst);
        var catalogues = new ObjectMapper().readTree("""
                {"tax_rates":[
                  {"name":"Excluding GST","amount":0,"isDefault":false},
                  {"name":"GST","amount":10,"isDefault":true}
                ]}
                """);

        Map<String, Object> result = service.promote("skr", 87L, false, catalogues);

        @SuppressWarnings("unchecked")
        Map<String, Object> counts = (Map<String, Object>) result.get("counts");
        assertEquals(0, counts.get("tax_rates"));
        assertEquals(2, counts.get("tax_rates_updated"));
        verify(taxRates).clearDefaults(87L);
        verify(taxRates).update(excluding, 87L);
        verify(taxRates).update(gst, 87L);
        verify(taxRates).markDefault(204L, 87L);
        assertEquals(BigDecimal.ZERO, excluding.getAmount());
        assertEquals(true, gst.getIsDefault());
    }

    @Test
    void updatesExistingPaymentMethodTypeFromShopfront() throws Exception {
        PaymentMethod eftpos = new PaymentMethod();
        eftpos.setName("EFTPOS");
        eftpos.setType("OTHER");
        eftpos.setSurcharge(BigDecimal.ZERO);
        when(paymentMethods.findByName("EFTPOS", 87L)).thenReturn(eftpos);
        var catalogues = new ObjectMapper().readTree("""
                {"payment_methods":[{"name":"EFTPOS","type":"EFTPOS"}]}
                """);

        Map<String, Object> result = service.promote("skr", 87L, false, catalogues);

        @SuppressWarnings("unchecked")
        Map<String, Object> counts = (Map<String, Object>) result.get("counts");
        assertEquals(1, counts.get("payment_methods_updated"));
        assertEquals("EFTPOS", eftpos.getType());
        verify(paymentMethods).update(eftpos, 87L);
    }

    @Test
    void forceEmptyOnlyPreservesExistingTaxRate() throws Exception {
        TaxRate existing = rate(208L, "Excluding GST", new BigDecimal("10"), false);
        when(taxRates.findByNameIgnoreCase("Excluding GST", 87L)).thenReturn(existing);
        var catalogues = new ObjectMapper().readTree("""
                {"tax_rates":[{"name":"Excluding GST","amount":0}]}
                """);

        service.promote("skr", 87L, true, catalogues);

        verify(taxRates, org.mockito.Mockito.never()).update(existing, 87L);
        verify(taxRates, org.mockito.Mockito.never()).clearDefaults(87L);
        assertEquals(new BigDecimal("10"), existing.getAmount());
    }

    private TaxRate rate(Long id, String name, BigDecimal amount, boolean isDefault) {
        TaxRate rate = new TaxRate();
        rate.setId(id);
        rate.setName(name);
        rate.setAmount(amount);
        rate.setIsDefault(isDefault);
        rate.setOutletId(87L);
        return rate;
    }
}
