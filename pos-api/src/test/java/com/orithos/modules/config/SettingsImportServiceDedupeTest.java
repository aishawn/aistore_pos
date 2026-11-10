package com.orithos.modules.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.payment.PaymentMethod;
import com.orithos.modules.payment.PaymentMethodMapper;
import com.orithos.modules.register.OutletMapper;
import com.orithos.modules.register.RegisterMapper;
import com.orithos.modules.tax.TaxRate;
import com.orithos.modules.tax.TaxRateMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SettingsImportServiceDedupeTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final CompanySettingsService companySettings = mock(CompanySettingsService.class);
    private final TaxRateMapper taxRates = mock(TaxRateMapper.class);
    private final PaymentMethodMapper paymentMethods = mock(PaymentMethodMapper.class);
    private final OutletMapper outlets = mock(OutletMapper.class);
    private final RegisterMapper registers = mock(RegisterMapper.class);
    private SettingsImportService service;

    @BeforeEach
    void setUp() {
        service = new SettingsImportService(
                jdbc,
                new ObjectMapper(),
                companySettings,
                taxRates,
                paymentMethods,
                outlets,
                registers);
    }

    @Test
    void dedupeCataloguesMergesDuplicateNamesKeepingLowestId() {
        TaxRate gst1 = tax("GST", 1L);
        TaxRate gst2 = tax("gst", 9L);
        TaxRate free = tax("GST Free", 2L);
        when(taxRates.findAllActiveAsc()).thenReturn(List.of(gst1, free, gst2));

        PaymentMethod cash1 = pay("Cash", 3L);
        PaymentMethod cash2 = pay("CASH", 11L);
        PaymentMethod card = pay("EFTPOS", 4L);
        when(paymentMethods.findAllActiveAsc()).thenReturn(List.of(cash1, card, cash2));

        Map<String, Object> result = service.dedupeCatalogues();

        assertEquals(1, result.get("tax_rates_removed"));
        assertEquals(1, result.get("payment_methods_removed"));
        verify(taxRates).reassignProductTaxRate(1L, 9L);
        verify(taxRates).softDelete(9L);
        verify(taxRates, never()).softDelete(1L);
        verify(taxRates, never()).softDelete(2L);
        verify(paymentMethods).reassignSalePayment(3L, 11L);
        verify(paymentMethods).dropConflictingRegisterAssignments(3L, 11L);
        verify(paymentMethods).reassignRegisterPaymentMethod(3L, 11L);
        verify(paymentMethods).softDelete(11L);
        verify(paymentMethods, never()).softDelete(eq(3L));
        verify(paymentMethods, times(1)).softDelete(anyLong());
    }

    private static TaxRate tax(String name, long id) {
        TaxRate rate = new TaxRate();
        rate.setId(id);
        rate.setName(name);
        return rate;
    }

    private static PaymentMethod pay(String name, long id) {
        PaymentMethod method = new PaymentMethod();
        method.setId(id);
        method.setName(name);
        return method;
    }
}
