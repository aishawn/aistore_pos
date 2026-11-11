package com.orithos.modules.product;

import com.orithos.common.AustraliaTime;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class ProductActivityService {

    private static final int PERFORMANCE_DAYS = 30;

    private final ProductActivityMapper mapper;

    public ProductActivityService(ProductActivityMapper mapper) {
        this.mapper = mapper;
    }

    public Chart chart(Long productId) {
        LocalDate latest = mapper.latestSaleDate(productId);
        LocalDate anchor = latest != null ? latest : AustraliaTime.today();
        LocalDate start = financialYearStart(anchor);
        String from = start.toString();
        String to = start.plusYears(1).toString();
        BigDecimal[] sales = buckets(mapper.salesByMonth(productId, from, to));
        BigDecimal[] purchases = buckets(mapper.purchasesByMonth(productId, from, to));
        return new Chart(Arrays.asList(sales), Arrays.asList(purchases));
    }

    public List<ProductActivityMapper.SaleLine> sales(Long productId) {
        return mapper.sales(productId);
    }

    public List<ProductActivityMapper.OrderLine> purchases(Long productId) {
        return mapper.orders(productId, 0);
    }

    public List<ProductActivityMapper.OrderLine> transfers(Long productId) {
        return mapper.orders(productId, 1);
    }

    /**
     * Units sold per Adelaide business day for the last {@value #PERFORMANCE_DAYS} days (oldest first, ending today).
     * Missing days are zero-filled.
     */
    public Map<Long, List<BigDecimal>> performance30d(List<Long> productIds) {
        if (productIds == null || productIds.isEmpty()) {
            return Map.of();
        }
        LocalDate today = AustraliaTime.today();
        LocalDate start = today.minusDays(PERFORMANCE_DAYS - 1L);
        String from = start.toString();
        String to = today.plusDays(1).toString();
        List<ProductActivityMapper.DailyQuantity> rows =
                mapper.salesQuantityByDay(productIds, from, to);

        Map<Long, List<BigDecimal>> seriesByProduct = new HashMap<>();
        for (Long productId : productIds) {
            if (productId != null) {
                seriesByProduct.put(productId, emptyPerformanceSeries());
            }
        }
        if (rows != null) {
            for (ProductActivityMapper.DailyQuantity row : rows) {
                if (row.getProductId() == null || row.getDay() == null) {
                    continue;
                }
                long index = ChronoUnit.DAYS.between(start, row.getDay());
                if (index < 0 || index >= PERFORMANCE_DAYS) {
                    continue;
                }
                BigDecimal quantity = row.getQuantity() == null
                        ? BigDecimal.ZERO
                        : row.getQuantity().setScale(2, RoundingMode.HALF_UP);
                List<BigDecimal> series = seriesByProduct.get(row.getProductId());
                if (series == null) {
                    continue;
                }
                series.set((int) index, series.get((int) index).add(quantity).setScale(2, RoundingMode.HALF_UP));
            }
        }
        return seriesByProduct;
    }

    private static List<BigDecimal> emptyPerformanceSeries() {
        List<BigDecimal> series = new ArrayList<>(PERFORMANCE_DAYS);
        BigDecimal zero = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        for (int i = 0; i < PERFORMANCE_DAYS; i++) {
            series.add(zero);
        }
        return series;
    }

    public List<InventoryEvent> inventoryLog(Long productId) {
        List<InventoryEvent> events = new ArrayList<>();
        for (ProductActivityMapper.SaleLine line : mapper.sales(productId)) {
            events.add(new InventoryEvent(
                    line.getSoldAt(),
                    "Sale",
                    line.getInvoiceId(),
                    negate(line.getQuantity())));
        }
        for (ProductActivityMapper.OrderLine line : mapper.orders(productId, 0)) {
            if (!"RECEIVED".equalsIgnoreCase(line.getStatus())) {
                continue;
            }
            events.add(new InventoryEvent(
                    line.getOccurredAt(),
                    "Purchase",
                    firstText(line.getInvoiceNumber(), line.getReference()),
                    line.getQuantity()));
        }
        events.sort((a, b) -> {
            LocalDateTime left = a.occurredAt() == null ? LocalDateTime.MIN : a.occurredAt();
            LocalDateTime right = b.occurredAt() == null ? LocalDateTime.MIN : b.occurredAt();
            return right.compareTo(left);
        });
        return events;
    }

    private static BigDecimal[] buckets(List<ProductActivityMapper.MonthAmount> rows) {
        BigDecimal[] values = new BigDecimal[12];
        for (int i = 0; i < values.length; i++) {
            values[i] = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        if (rows == null) {
            return values;
        }
        for (ProductActivityMapper.MonthAmount row : rows) {
            if (row.getMonth() == null) {
                continue;
            }
            int index = (row.getMonth() + 5) % 12;
            BigDecimal amount = row.getAmount() == null ? BigDecimal.ZERO : row.getAmount();
            values[index] = amount.setScale(2, RoundingMode.HALF_UP);
        }
        return values;
    }

    private static LocalDate financialYearStart(LocalDate today) {
        int year = today.getMonthValue() >= 7 ? today.getYear() : today.getYear() - 1;
        return LocalDate.of(year, 7, 1);
    }

    private static BigDecimal negate(BigDecimal quantity) {
        if (quantity == null) {
            return BigDecimal.ZERO;
        }
        return quantity.negate();
    }

    private static String firstText(String a, String b) {
        if (a != null && !a.isBlank()) {
            return a;
        }
        return b;
    }

    public record Chart(List<BigDecimal> sales, List<BigDecimal> purchases) {}

    public record InventoryEvent(LocalDateTime occurredAt, String type, String reference, BigDecimal quantity) {}
}
