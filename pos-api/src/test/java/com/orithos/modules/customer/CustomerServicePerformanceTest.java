package com.orithos.modules.customer;

import com.orithos.modules.customer.mapper.ContactMapper;
import com.orithos.modules.customer.mapper.CustomerEmailMapper;
import com.orithos.modules.customer.mapper.CustomerMapper;
import com.orithos.modules.customer.mapper.CustomerMapper.CustomerDailyQuantity;
import com.orithos.modules.sale.SaleMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CustomerServicePerformanceTest {
    private final CustomerMapper customers = mock(CustomerMapper.class);

    @Test
    void performanceSeriesReadsOnlySalesFromTheCustomersOutlet() {
        LocalDate today = LocalDate.of(2026, 11, 13);
        Customer customer = new Customer();
        customer.setId(42L);

        CustomerDailyQuantity quantity = new CustomerDailyQuantity();
        quantity.setCustomerId(42L);
        quantity.setDay(today.minusDays(1));
        quantity.setQuantity(new BigDecimal("2.5"));
        when(customers.salesQuantityByDay(eq(12L), eq(List.of(42L)), anyString(), anyString()))
                .thenReturn(List.of(quantity));

        CustomerService service = new CustomerService(
                customers, mock(ContactMapper.class), mock(CustomerEmailMapper.class),
                mock(CustomerRevisionService.class), mock(SaleMapper.class), mock(CustomerGroupService.class));
        service.attachPerformance(List.of(customer), 12L, today);

        assertEquals(30, customer.getPerformance30d().size());
        assertEquals(0.0d, customer.getPerformance30d().get(27));
        assertEquals(2.5d, customer.getPerformance30d().get(28));
        assertEquals(0.0d, customer.getPerformance30d().get(29));
        verify(customers).salesQuantityByDay(12L, List.of(42L), today.minusDays(29).toString(), today.toString());
    }
}
