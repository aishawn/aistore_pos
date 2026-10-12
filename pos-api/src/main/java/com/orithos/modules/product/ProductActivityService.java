package com.orithos.modules.product;

import com.orithos.common.AustraliaTime;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@Service
public class ProductActivityService {

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
