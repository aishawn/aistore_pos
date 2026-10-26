package com.orithos.modules.sell;

import com.orithos.modules.customer.mapper.CustomerMapper;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.modules.sale.SaleMapper;
import org.junit.jupiter.api.Test;

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
        when(sales.page("PARKED", null, 50, 0)).thenReturn(List.of());

        SellService service = new SellService(products, customers, sales);

        assertEquals(List.of(), service.listParked());
        verify(sales).page("PARKED", null, 50, 0);
        verify(sales, never()).expireParkedBefore(any(), any());
    }
}
