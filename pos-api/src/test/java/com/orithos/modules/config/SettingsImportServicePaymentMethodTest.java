package com.orithos.modules.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.payment.PaymentMethod;
import com.orithos.modules.payment.PaymentMethodMapper;
import com.orithos.modules.register.RegisterMapper;
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

class SettingsImportServicePaymentMethodTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final TaxRateMapper taxRates = mock(TaxRateMapper.class);
    private final PaymentMethodMapper paymentMethods = mock(PaymentMethodMapper.class);
    private final RegisterMapper registers = mock(RegisterMapper.class);
    private final SettingsImportService service = new SettingsImportService(
            jdbc, new ObjectMapper(), taxRates, paymentMethods, registers);

    @BeforeEach
    void setUp() {
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
    void updatesAllPaymentMethodFieldsSupportedByOrithosSetup() throws Exception {
        PaymentMethod existing = new PaymentMethod();
        existing.setName("EFTPOS");
        existing.setType("OTHER");
        existing.setSurcharge(BigDecimal.ZERO);
        existing.setAlwaysOpenDrawer(false);
        existing.setAlwaysPrint(false);
        existing.setUseRounding(false);
        existing.setDefaultPayExact(false);
        existing.setBackgroundColour("#ffffff");
        existing.setTextColour("#000000");
        when(paymentMethods.findByName("EFTPOS", 87L)).thenReturn(existing);

        var catalogues = new ObjectMapper().readTree("""
                {"payment_methods":[{
                  "name":"EFTPOS","type":"EFTPOS","surcharge":1.5,
                  "alwaysOpenDrawer":true,"alwaysPrint":true,"useRounding":true,
                  "defaultPayExact":true,"backgroundColour":"#123456","textColour":"#abcdef"
                }]}
                """);

        Map<String, Object> result = service.promote("skr", 87L, false, catalogues);

        @SuppressWarnings("unchecked")
        Map<String, Object> counts = (Map<String, Object>) result.get("counts");
        assertEquals(1, counts.get("payment_methods_updated"));
        assertEquals("EFTPOS", existing.getType());
        assertEquals(new BigDecimal("1.5"), existing.getSurcharge());
        assertEquals(true, existing.getAlwaysOpenDrawer());
        assertEquals(true, existing.getAlwaysPrint());
        assertEquals(true, existing.getUseRounding());
        assertEquals(true, existing.getDefaultPayExact());
        assertEquals("#123456", existing.getBackgroundColour());
        assertEquals("#abcdef", existing.getTextColour());
        verify(paymentMethods).update(existing, 87L);
    }
}
