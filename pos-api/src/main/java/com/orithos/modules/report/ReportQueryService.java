package com.orithos.modules.report;

import com.orithos.common.AustraliaTime;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.temporal.WeekFields;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Shared aggregates for POST /api/reports and AI template SQL (same views /口径).
 */
@Service
public class ReportQueryService {

    public enum Grain { DAY, WEEK, MONTH }

    public record Period(LocalDateTime from, LocalDateTime toExclusive) {}

    private final JdbcTemplate jdbc;

    public ReportQueryService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Period defaultPeriod(Grain grain) {
        LocalDate today = AustraliaTime.today();
        return switch (grain) {
            case DAY -> new Period(today.minusDays(13).atStartOfDay(), today.plusDays(1).atStartOfDay());
            case WEEK -> new Period(today.minusWeeks(5).atStartOfDay(), today.plusDays(1).atStartOfDay());
            case MONTH -> new Period(today.minusMonths(5).withDayOfMonth(1).atStartOfDay(),
                    today.plusDays(1).atStartOfDay());
        };
    }

    public DailySalesReport dailySales(long outletId, LocalDate date) {
        LocalDate day = date == null ? AustraliaTime.today() : date;
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT COALESCE(SUM(s.total_price), 0) AS total_sales,
                       COUNT(s.id) AS transaction_count,
                       COALESCE(SUM(COALESCE(s.total_cost, line.cost, 0)), 0) AS cost
                FROM sale s
                LEFT JOIN (
                  SELECT si.sale_id,
                         SUM(COALESCE(si.cost, pc.cost, p.cost, 0) * COALESCE(si.quantity, 0)) AS cost
                  FROM sale_item si
                  LEFT JOIN product p ON p.id = si.product_id
                  LEFT JOIN product_cost pc ON pc.product_id = si.product_id AND pc.outlet_id = si.outlet_id
                  GROUP BY si.sale_id
                ) line ON line.sale_id = s.id
                WHERE s.status = 'COMPLETED'
                  AND s.outlet_id = ?
                  AND COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) = ?
                """, outletId, sqlDate(day));
        Map<String, Object> row = rows.isEmpty() ? Map.of() : rows.get(0);
        return DailySalesReport.of(
                day,
                toDecimal(row.get("total_sales")),
                toDecimal(row.get("cost")),
                toDecimal(row.get("transaction_count")).longValue());
    }

    public List<DailySalesReport> weeklySales(long outletId, LocalDate date) {
        LocalDate today = date == null ? AustraliaTime.today() : date;
        LocalDate weekStart = today.with(DayOfWeek.MONDAY);
        return salesByDayRange(outletId, weekStart, today);
    }

    /** Previous ISO week (Mon–Sun) as one aggregated row; no per-day breakdown. */
    public DailySalesReport lastWeekSales(long outletId, LocalDate date) {
        LocalDate today = date == null ? AustraliaTime.today() : date;
        LocalDate weekStart = today.minusWeeks(1).with(DayOfWeek.MONDAY);
        return salesAggregate(outletId, weekStart, weekStart.plusDays(6));
    }

    /** Previous calendar month (1st through last day) as one aggregated row. */
    public DailySalesReport lastMonthSales(long outletId, LocalDate date) {
        LocalDate today = date == null ? AustraliaTime.today() : date;
        YearMonth lastMonth = YearMonth.from(today).minusMonths(1);
        return salesAggregate(outletId, lastMonth.atDay(1), lastMonth.atEndOfMonth());
    }

    /** Current calendar month: the 1st through today. */
    public List<DailySalesReport> thisMonthSales(long outletId, LocalDate date) {
        LocalDate today = date == null ? AustraliaTime.today() : date;
        return salesByDayRange(outletId, today.withDayOfMonth(1), today);
    }

    private DailySalesReport salesAggregate(long outletId, LocalDate fromInclusive, LocalDate toInclusive) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT COALESCE(SUM(s.total_price), 0) AS total_sales,
                       COUNT(s.id) AS transaction_count,
                       COALESCE(SUM(COALESCE(s.total_cost, line.cost, 0)), 0) AS cost
                FROM sale s
                LEFT JOIN (
                  SELECT si.sale_id,
                         SUM(COALESCE(si.cost, pc.cost, p.cost, 0) * COALESCE(si.quantity, 0)) AS cost
                  FROM sale_item si
                  LEFT JOIN product p ON p.id = si.product_id
                  LEFT JOIN product_cost pc ON pc.product_id = si.product_id AND pc.outlet_id = si.outlet_id
                  GROUP BY si.sale_id
                ) line ON line.sale_id = s.id
                WHERE s.status = 'COMPLETED'
                  AND s.outlet_id = ?
                  AND COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) >= ?
                  AND COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) <= ?
                """, outletId, sqlDate(fromInclusive), sqlDate(toInclusive));
        Map<String, Object> row = rows.isEmpty() ? Map.of() : rows.get(0);
        return DailySalesReport.of(
                null,
                toDecimal(row.get("total_sales")),
                toDecimal(row.get("cost")),
                toDecimal(row.get("transaction_count")).longValue());
    }

    private List<DailySalesReport> salesByDayRange(long outletId, LocalDate fromInclusive, LocalDate toInclusive) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) AS d,
                       COALESCE(SUM(s.total_price), 0) AS total_sales,
                       COUNT(s.id) AS transaction_count,
                       COALESCE(SUM(COALESCE(s.total_cost, line.cost, 0)), 0) AS cost
                FROM sale s
                LEFT JOIN (
                  SELECT si.sale_id,
                         SUM(COALESCE(si.cost, pc.cost, p.cost, 0) * COALESCE(si.quantity, 0)) AS cost
                  FROM sale_item si
                  LEFT JOIN product p ON p.id = si.product_id
                  LEFT JOIN product_cost pc ON pc.product_id = si.product_id AND pc.outlet_id = si.outlet_id
                  GROUP BY si.sale_id
                ) line ON line.sale_id = s.id
                WHERE s.status = 'COMPLETED'
                  AND s.outlet_id = ?
                  AND COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) >= ?
                  AND COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) <= ?
                GROUP BY COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at))
                """, outletId, sqlDate(fromInclusive), sqlDate(toInclusive));
        Map<LocalDate, Map<String, Object>> byDate = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            LocalDate d = toLocalDate(row.get("d"));
            if (d != null) {
                byDate.put(d, row);
            }
        }
        return fillDays(fromInclusive, toInclusive, byDate);
    }

    static List<DailySalesReport> weekThroughToday(LocalDate today) {
        LocalDate weekStart = today.with(DayOfWeek.MONDAY);
        return fillDays(weekStart, today, Map.of());
    }

    static DailySalesReport lastWeekEmpty() {
        return DailySalesReport.of(null, null, null, 0);
    }

    static DailySalesReport lastMonthEmpty() {
        return DailySalesReport.of(null, null, null, 0);
    }

    static List<DailySalesReport> thisMonthThroughToday(LocalDate today) {
        return fillDays(today.withDayOfMonth(1), today, Map.of());
    }

    private static List<DailySalesReport> fillDays(LocalDate fromInclusive, LocalDate toInclusive,
                                                   Map<LocalDate, Map<String, Object>> byDate) {
        List<DailySalesReport> out = new ArrayList<>();
        for (LocalDate d = fromInclusive; !d.isAfter(toInclusive); d = d.plusDays(1)) {
            Map<String, Object> row = byDate.getOrDefault(d, Map.of());
            out.add(DailySalesReport.of(
                    d,
                    toDecimal(row.get("total_sales")),
                    toDecimal(row.get("cost")),
                    toDecimal(row.get("transaction_count")).longValue()));
        }
        return out;
    }

    public List<Map<String, Object>> salesByDay(long outletId, LocalDateTime from, LocalDateTime toExclusive,
                                                String category) {
        if (category != null && !category.isBlank()) {
            String like = "%" + category.trim() + "%";
            return jdbc.queryForList("""
                    SELECT si.business_date AS d, SUM(si.amount) AS sales, SUM(si.qty) AS qty
                    FROM ai_rpt_sale_item si
                    JOIN ai_rpt_product p ON p.id = si.product_id
                    WHERE si.outlet_id = ? AND si.business_date >= ? AND si.business_date < ?
                      AND (p.category_name LIKE ? OR p.name LIKE ?)
                    GROUP BY si.business_date
                    ORDER BY d
                    LIMIT 366
                    """, outletId, sqlDate(from.toLocalDate()), sqlDate(toExclusive.toLocalDate()), like, like);
        }
        return jdbc.queryForList("""
                SELECT business_date AS d, SUM(amount) AS sales, SUM(qty) AS qty
                FROM ai_rpt_sale_item
                WHERE outlet_id = ? AND business_date >= ? AND business_date < ?
                GROUP BY business_date
                ORDER BY d
                LIMIT 366
                """, outletId, sqlDate(from.toLocalDate()), sqlDate(toExclusive.toLocalDate()));
    }

    public Map<String, Object> averageOrderValue(long outletId, LocalDateTime from, LocalDateTime toExclusive) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT COUNT(*) AS tickets, COALESCE(SUM(amount), 0) AS sales
                FROM ai_rpt_customer_sale
                WHERE outlet_id = ? AND business_date >= ? AND business_date < ?
                LIMIT 1
                """, outletId, sqlDate(from.toLocalDate()), sqlDate(toExclusive.toLocalDate()));
        Map<String, Object> row = rows.isEmpty() ? Map.of() : rows.get(0);
        BigDecimal tickets = toDecimal(row.get("tickets"));
        BigDecimal sales = toDecimal(row.get("sales"));
        BigDecimal aov = tickets.compareTo(BigDecimal.ZERO) == 0
                ? BigDecimal.ZERO
                : sales.divide(tickets, 2, RoundingMode.HALF_UP);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("tickets", tickets);
        out.put("sales", sales);
        out.put("aov", aov);
        return out;
    }

    public List<Map<String, Object>> stock(long outletId, String query) {
        String like = (query == null || query.isBlank()) ? "%" : "%" + query.trim() + "%";
        return jdbc.queryForList("""
                SELECT p.id, p.name, i.quantity
                FROM ai_rpt_inventory i
                JOIN ai_rpt_product p ON p.id = i.product_id
                WHERE i.outlet_id = ? AND p.name LIKE ?
                ORDER BY p.name
                LIMIT 50
                """, outletId, like);
    }

    public List<Map<String, Object>> deadStock(long outletId, int days) {
        int window = days <= 0 ? 30 : days;
        LocalDate today = AustraliaTime.today();
        return jdbc.queryForList("""
                SELECT p.id, p.name, i.quantity AS on_hand, COALESCE(s.qty, 0) AS sold_qty
                FROM ai_rpt_inventory i
                JOIN ai_rpt_product p ON p.id = i.product_id
                LEFT JOIN (
                  SELECT product_id, SUM(qty) AS qty
                  FROM ai_rpt_sale_item
                  WHERE outlet_id = ? AND business_date >= ? AND business_date < ?
                  GROUP BY product_id
                ) s ON s.product_id = i.product_id
                WHERE i.outlet_id = ?
                  AND i.quantity > 0
                  AND COALESCE(s.qty, 0) < 1
                ORDER BY i.quantity DESC
                LIMIT 50
                """, outletId, sqlDate(today.minusDays(window)), sqlDate(today.plusDays(1)), outletId);
    }

    /**
     * Builds the existing POST /api/reports payload shape from real aggregates.
     */
    public Map<String, Object> runDsl(String query, TenantContext tenant) {
        Long outletId = tenant == null ? null : tenant.requireOutletId();
        if (outletId == null) {
            return emptyPayload(AustraliaTime.today().minusMonths(6), AustraliaTime.today());
        }
        String q = query == null ? "" : query.toLowerCase(Locale.ROOT);
        Grain grain = Grain.WEEK;
        if (q.contains("range day")) {
            grain = Grain.DAY;
        } else if (q.contains("range month")) {
            grain = Grain.MONTH;
        }
        Period period = parseStart(q, grain);
        if (q.contains("inventory") || q.contains("stock") || q.contains("from inventory")) {
            return stockPayload(outletId, period);
        }
        if (q.contains("transaction_count") || q.contains("aov") || q.contains("average")) {
            return aovPayload(outletId, period);
        }
        boolean qty = q.contains("quantity") || q.contains("qty") || q.contains("units");
        return salesPayload(outletId, period, grain, qty);
    }

    private Period parseStart(String q, Grain grain) {
        LocalDate today = AustraliaTime.today();
        LocalDateTime to = today.plusDays(1).atStartOfDay();
        LocalDateTime from;
        if (q.contains("6 months ago") || q.contains("6 month")) {
            from = today.minusMonths(6).atStartOfDay();
        } else if (q.contains("3 months ago") || q.contains("3 month")) {
            from = today.minusMonths(3).atStartOfDay();
        } else if (q.contains("1 month ago") || q.contains("last month")) {
            from = today.minusMonths(1).withDayOfMonth(1).atStartOfDay();
        } else if (q.contains("7 days") || q.contains("last week")) {
            from = today.minusDays(7).atStartOfDay();
        } else {
            from = defaultPeriod(grain).from();
        }
        return new Period(from, to);
    }

    private Map<String, Object> salesPayload(long outletId, Period period, Grain grain, boolean qtyMetric) {
        List<Map<String, Object>> daily = salesByDay(outletId, period.from(), period.toExclusive(), null);
        Map<String, BigDecimal> buckets = new LinkedHashMap<>();
        for (Map<String, Object> row : daily) {
            LocalDate d = toLocalDate(row.get("d"));
            if (d == null) {
                continue;
            }
            String col = columnLabel(d, grain);
            BigDecimal add = toDecimal(qtyMetric ? row.get("qty") : row.get("sales"));
            buckets.merge(col, add, BigDecimal::add);
        }
        fillEmptyBuckets(buckets, period, grain);
        return tablePayload("Total", buckets, period);
    }

    private Map<String, Object> aovPayload(long outletId, Period period) {
        Map<String, Object> aov = averageOrderValue(outletId, period.from(), period.toExclusive());
        Map<String, BigDecimal> buckets = new LinkedHashMap<>();
        buckets.put("AOV", toDecimal(aov.get("aov")));
        buckets.put("Tickets", toDecimal(aov.get("tickets")));
        buckets.put("Sales", toDecimal(aov.get("sales")));
        return tablePayload("Store", buckets, period);
    }

    private Map<String, Object> stockPayload(long outletId, Period period) {
        List<Map<String, Object>> rows = stock(outletId, null);
        List<String> columns = List.of("Name", "Qty");
        List<Map<String, Object>> data = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        int i = 0;
        for (Map<String, Object> row : rows) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("Name", String.valueOf(row.getOrDefault("name", "")));
            BigDecimal qty = toDecimal(row.get("quantity"));
            out.put("Qty", qty.toPlainString());
            out.put("_unsorted_index", "row-" + i++);
            data.add(out);
            total = total.add(qty);
        }
        Map<String, Object> totals = new LinkedHashMap<>();
        totals.put("Qty", total);
        return wrap(columns, data, totals, period);
    }

    private Map<String, Object> tablePayload(String rowName, Map<String, BigDecimal> buckets, Period period) {
        List<String> columns = new ArrayList<>();
        columns.add("Name");
        columns.addAll(buckets.keySet());
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("Name", rowName);
        buckets.forEach((k, v) -> row.put(k, v.setScale(2, RoundingMode.HALF_UP).toPlainString()));
        row.put("_unsorted_index", "row-0");
        Map<String, Object> totals = new LinkedHashMap<>();
        buckets.forEach((k, v) -> totals.put(k, v.setScale(2, RoundingMode.HALF_UP)));
        return wrap(columns, List.of(row), totals, period);
    }

    private Map<String, Object> wrap(List<String> columns, List<Map<String, Object>> data,
                                     Map<String, Object> totals, Period period) {
        Map<String, Object> range = new LinkedHashMap<>();
        range.put("start", period.from() + " 00:00:00");
        range.put("end", period.toExclusive().minusSeconds(1) + "");
        Map<String, Object> inner = new LinkedHashMap<>();
        inner.put("totals", totals);
        inner.put("data", data);
        inner.put("groups", List.of());
        inner.put("columns", columns);
        inner.put("range", range);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("data", inner);
        payload.put("key", UUID.randomUUID().toString());
        payload.put("completed", true);
        return payload;
    }

    private Map<String, Object> emptyPayload(LocalDate start, LocalDate end) {
        return wrap(List.of("Name"), List.of(), Map.of(),
                new Period(start.atStartOfDay(), end.plusDays(1).atStartOfDay()));
    }

    private static void fillEmptyBuckets(Map<String, BigDecimal> buckets, Period period, Grain grain) {
        LocalDate d = period.from().toLocalDate();
        LocalDate end = period.toExclusive().toLocalDate();
        while (!d.isAfter(end.minusDays(1))) {
            buckets.putIfAbsent(columnLabel(d, grain), BigDecimal.ZERO);
            d = switch (grain) {
                case DAY -> d.plusDays(1);
                case WEEK -> d.plusWeeks(1);
                case MONTH -> d.plusMonths(1);
            };
        }
        Map<String, BigDecimal> ordered = new LinkedHashMap<>();
        buckets.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .forEach(e -> ordered.put(e.getKey(), e.getValue()));
        buckets.clear();
        buckets.putAll(ordered);
    }

    private static String columnLabel(LocalDate d, Grain grain) {
        return switch (grain) {
            case DAY -> d.toString();
            case WEEK -> {
                WeekFields wf = WeekFields.ISO;
                yield d.get(wf.weekBasedYear()) + " " + String.format("%02d", d.get(wf.weekOfWeekBasedYear()));
            }
            case MONTH -> YearMonth.from(d).format(DateTimeFormatter.ofPattern("yyyy-MM"));
        };
    }

    /**
     * Bind a civil date as {@code yyyy-MM-dd}. {@code java.sql.Date} plus
     * {@code serverTimezone=UTC} shifts the value to the previous day on this host.
     */
    private static String sqlDate(LocalDate day) {
        return day.toString();
    }

    private static LocalDate toLocalDate(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof java.sql.Date d) {
            return d.toLocalDate();
        }
        if (raw instanceof Timestamp ts) {
            return ts.toLocalDateTime().toLocalDate();
        }
        if (raw instanceof LocalDate d) {
            return d;
        }
        return LocalDate.parse(raw.toString().substring(0, 10));
    }

    public static BigDecimal toDecimal(Object raw) {
        if (raw == null) {
            return BigDecimal.ZERO;
        }
        if (raw instanceof BigDecimal bd) {
            return bd;
        }
        if (raw instanceof Number n) {
            return BigDecimal.valueOf(n.doubleValue());
        }
        try {
            return new BigDecimal(raw.toString());
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }
}
