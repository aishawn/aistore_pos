package com.orithos.modules.product;

import com.orithos.common.AustraliaTime;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentMatchers;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProductActivityServicePerformanceTest {

    @Mock
    private ProductActivityMapper mapper;

    @Test
    void performance30dFillsMissingDaysAndPlacesQuantities() {
        LocalDate today = AustraliaTime.today();
        LocalDate start = today.minusDays(29);
        ProductActivityMapper.DailyQuantity row = new ProductActivityMapper.DailyQuantity();
        row.setProductId(11L);
        row.setDay(today.minusDays(2));
        row.setQuantity(new BigDecimal("3.5"));
        when(mapper.salesQuantityByDay(
                ArgumentMatchers.eq(List.of(11L)),
                ArgumentMatchers.eq(start.toString()),
                ArgumentMatchers.eq(today.plusDays(1).toString())
        )).thenReturn(List.of(row));

        ProductActivityService service = new ProductActivityService(mapper);
        Map<Long, List<BigDecimal>> series = service.performance30d(List.of(11L));

        assertTrue(series.containsKey(11L));
        List<BigDecimal> points = series.get(11L);
        assertEquals(30, points.size());
        assertEquals(0, points.get(0).compareTo(BigDecimal.ZERO.setScale(2)));
        assertEquals(0, points.get(27).compareTo(new BigDecimal("3.50")));
        assertEquals(0, points.get(29).compareTo(BigDecimal.ZERO.setScale(2)));
    }
}
