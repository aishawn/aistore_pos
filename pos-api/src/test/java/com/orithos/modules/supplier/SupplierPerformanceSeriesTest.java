package com.orithos.modules.supplier;

import com.orithos.modules.customer.mapper.ContactMapper;
import com.orithos.modules.register.OutletMapper;
import com.orithos.modules.supplier.mapper.SupplierAdditionalContactMapper;
import com.orithos.modules.supplier.mapper.SupplierAuthenticationMapper;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class SupplierPerformanceSeriesTest {

    private static SupplierService service(SupplierMapper mapper) {
        return new SupplierService(
                mapper,
                mock(ContactMapper.class),
                mock(SupplierAuthenticationMapper.class),
                mock(SupplierAdditionalContactMapper.class),
                mock(PasswordEncoder.class),
                mock(OutletMapper.class));
    }

    @Test
    void attachPerformanceFillsThirtyDaySeriesFromSalesRows() {
        SupplierMapper mapper = mock(SupplierMapper.class);
        SupplierService service = service(mapper);
        Supplier first = new Supplier();
        first.setId(6L);
        Supplier second = new Supplier();
        second.setId(15L);
        List<Supplier> items = new ArrayList<>(List.of(first, second));
        LocalDate today = LocalDate.of(2026, 11, 11);
        LocalDate from = today.minusDays(29);

        SupplierMapper.SupplierDailyQuantity peak = new SupplierMapper.SupplierDailyQuantity();
        peak.setSupplierId(6L);
        peak.setDay(today.minusDays(2));
        peak.setQuantity(new BigDecimal("12.5"));
        when(mapper.salesQuantityByDay(eq(55L), anyList(), eq(from.toString()), eq(today.toString())))
                .thenReturn(List.of(peak));

        assertEquals(27, ChronoUnit.DAYS.between(from, today.minusDays(2)));

        service.attachPerformance(items, 55L, today);

        assertEquals(30, first.getPerformance30d().size());
        assertEquals(12.5d, first.getPerformance30d().get(27));
        assertEquals(0.0d, first.getPerformance30d().get(0));
        assertEquals(30, second.getPerformance30d().size());
        assertEquals(0.0d, second.getPerformance30d().stream().mapToDouble(Double::doubleValue).sum());
    }

    @Test
    void attachPerformanceSkipsMapperWhenListEmpty() {
        SupplierMapper mapper = mock(SupplierMapper.class);
        SupplierService service = service(mapper);

        service.attachPerformance(List.of(), 55L, LocalDate.of(2026, 11, 11));

        verifyNoInteractions(mapper);
    }
}
