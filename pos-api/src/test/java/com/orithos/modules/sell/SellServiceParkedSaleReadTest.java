package com.orithos.modules.sell;

import com.orithos.modules.customer.mapper.CustomerMapper;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.modules.sale.Sale;
import com.orithos.modules.sale.SaleMapper;
import com.orithos.common.BusinessTimezoneService;
import com.orithos.modules.config.CompanySettingsKeys;
import com.orithos.modules.config.CompanySettingsService;
import com.orithos.security.AuthUser;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.time.LocalDate;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.times;
import static org.mockito.ArgumentMatchers.any;

class SellServiceParkedSaleReadTest {

    @Test
    void listingParkedSalesDoesNotRunCleanupWrite() {
        ProductMapper products = mock(ProductMapper.class);
        CustomerMapper customers = mock(CustomerMapper.class);
        SaleMapper sales = mock(SaleMapper.class);
        Sale parked = new Sale();
        parked.setId(91L);
        parked.setStatus("PARKED");
        parked.setBusinessDate(com.orithos.common.AustraliaTime.today());
        when(sales.page(3L, 12L, "PARKED", null, 50, 0)).thenReturn(List.of(parked));

        SellService service = new SellService(products, customers, sales);

        assertEquals(List.of(parked), service.listParked());
        assertEquals(false, parked.getStale());
        verify(sales).page(3L, 12L, "PARKED", null, 50, 0);
        verify(sales, never()).expireParkedBefore(any(), any());
    }

    @Test
    void nativePosOnlyListingReadsParkedSalesFromOrithosLedger() {
        ProductMapper products = mock(ProductMapper.class);
        CustomerMapper customers = mock(CustomerMapper.class);
        SaleMapper sales = mock(SaleMapper.class);
        Sale parked = new Sale();
        parked.setId(92L);
        parked.setStatus("PARKED");
        parked.setBusinessDate(com.orithos.common.AustraliaTime.today());
        when(sales.page(3L, 12L, "PARKED", null, 50, 0)).thenReturn(List.of(parked));

        SellService service = new SellService(products, customers, sales, true);

        assertEquals(List.of(parked), service.listParked());
        verify(sales).page(3L, 12L, "PARKED", null, 50, 0);
        verify(sales, never()).expireParkedBefore(any(), any());
    }

    @Test
    void cleanupUsesEachVendorsConfiguredTimezoneAndScope() {
        ProductMapper products = mock(ProductMapper.class);
        CustomerMapper customers = mock(CustomerMapper.class);
        SaleMapper sales = mock(SaleMapper.class);
        CompanySettingsService settings = mock(CompanySettingsService.class);
        when(sales.findParkedVendorIds()).thenReturn(List.of(3L, 4L));
        when(settings.getString(CompanySettingsKeys.TIMEZONE, 3L, "Australia/Melbourne"))
                .thenReturn("Australia/Melbourne");
        when(settings.getString(CompanySettingsKeys.TIMEZONE, 4L, "Australia/Melbourne"))
                .thenReturn("Pacific/Auckland");
        BusinessTimezoneService timezones = new BusinessTimezoneService(settings);
        SellService service = new SellService(products, customers, sales, settings, timezones, true);

        service.expireOverdueParkedSales();

        LocalDate melbourneToday = LocalDate.now(ZoneId.of("Australia/Melbourne"));
        LocalDate aucklandToday = LocalDate.now(ZoneId.of("Pacific/Auckland"));
        verify(sales).expireParkedBefore(3L, ParkedSalePolicy.expireBefore(melbourneToday),
                ParkedSalePolicy.createdBeforeUtc(melbourneToday, ZoneId.of("Australia/Melbourne")));
        verify(sales).expireParkedBefore(4L, ParkedSalePolicy.expireBefore(aucklandToday),
                ParkedSalePolicy.createdBeforeUtc(aucklandToday, ZoneId.of("Pacific/Auckland")));
        verify(sales, times(1)).findParkedVendorIds();
    }

    @BeforeEach
    void authenticateOutlet() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "cashier", false, 12L, 3L), null, List.of()));
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }
}
