package com.orithos.modules.sell;

import com.orithos.modules.customer.mapper.CustomerMapper;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.modules.sale.Sale;
import com.orithos.modules.sale.SaleMapper;
import com.orithos.security.AuthUser;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
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
