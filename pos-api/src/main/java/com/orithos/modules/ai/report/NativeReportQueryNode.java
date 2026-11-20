package com.orithos.modules.ai.report;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.NodeAction;
import com.orithos.modules.report.ReportQueryService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class NativeReportQueryNode implements NodeAction {

    private final NativeAiReportQueryService queryService;
    private final ReportPeriodResolver periodResolver;
    private final ReportQueryService reportQueryService;
    private final ShopfrontSyncWatermark syncWatermark;

    @Autowired
    public NativeReportQueryNode(NativeAiReportQueryService queryService, ReportPeriodResolver periodResolver,
                                 ReportQueryService reportQueryService, ShopfrontSyncWatermark syncWatermark) {
        this.queryService = queryService;
        this.periodResolver = periodResolver;
        this.reportQueryService = reportQueryService;
        this.syncWatermark = syncWatermark;
    }

    NativeReportQueryNode(NativeAiReportQueryService queryService, ReportPeriodResolver periodResolver,
                          ReportQueryService reportQueryService) {
        this(queryService, periodResolver, reportQueryService, null);
    }

    @Override
    public Map<String, Object> apply(OverAllState state) {
        String intent = ReportGraphState.string(state, "intent");
        String question = ReportGraphState.string(state, "question");
        TenantContext tenant = ReportGraphState.tenant(state);
        ZoneId timezone = reportQueryService.zoneForVendor(tenant == null ? null : tenant.vendorId());
        if (timezone == null) timezone = com.orithos.common.AustraliaTime.ZONE;
        var comparisonDates = ExplicitReportDates.parsePair(question, timezone);
        ReportPeriodResolver.Window window = comparisonDates.map(dates -> {
            var first = dates.get(0).isBefore(dates.get(1)) ? dates.get(0) : dates.get(1);
            var last = dates.get(0).isAfter(dates.get(1)) ? dates.get(0) : dates.get(1);
            return new ReportPeriodResolver.Window(first.atStartOfDay(), last.plusDays(1).atStartOfDay(),
                    (int) (last.toEpochDay() - first.toEpochDay() + 1));
        }).orElseGet(() -> windowFromState(state));
        if ("report_adhoc".equals(intent)) {
            Map<String, Object> refused = new HashMap<>();
            refused.put("sql_path", "unsupported");
            refused.put("sql", "");
            refused.put("sql_raw", "");
            refused.put("sql_params", List.of());
            refused.put("sql_error", "NATIVE_REPORT_UNSUPPORTED");
            refused.put("report_rows", List.of());
            refused.put("report_columns", List.of());
            addProvenance(refused, window, "unavailable", null, null, timezone);
            return refused;
        }
        NativeAiReportQueryService.Result result;
        boolean hasCategory = ReportGraphState.slots(state).containsKey("category");
        boolean asksProfit = question != null && question.matches("(?is).*(利润|毛利|profit|margin).*");
        if ("report_sales".equals(intent) && comparisonDates.isPresent()) {
            if (hasCategory) {
                result = new NativeAiReportQueryService.Result(List.of(), "NATIVE_REPORT_UNSUPPORTED");
            } else if (tenant.requireOutletId() == null || !tenant.canQueryReport()) {
                result = new NativeAiReportQueryService.Result(List.of(), tenant.requireOutletId() == null
                        ? "NO_OUTLET" : "NO_PERMISSION");
            } else {
                try {
                    var dates = comparisonDates.get();
                    Map<String, Object> first = reportQueryService.nativeOverview(tenant.vendorId(),
                            tenant.requireOutletId(), dates.get(0), dates.get(0));
                    Map<String, Object> second = reportQueryService.nativeOverview(tenant.vendorId(),
                            tenant.requireOutletId(), dates.get(1), dates.get(1));
                    Map<String, Object> row = new HashMap<>();
                    row.put("comparison", true);
                    row.put("firstDate", dates.get(0).toString());
                    row.put("secondDate", dates.get(1).toString());
                    row.put("first", salesMetrics(first, tenant.canQueryCost()));
                    row.put("second", salesMetrics(second, tenant.canQueryCost()));
                    Object firstTransactions = ((Map<?, ?>) row.get("first")).get("transactions");
                    Object secondTransactions = ((Map<?, ?>) row.get("second")).get("transactions");
                    row.put("transactions", firstTransactions instanceof Number firstCount
                            && secondTransactions instanceof Number secondCount
                            ? ReportQueryService.toDecimal(firstCount).add(ReportQueryService.toDecimal(secondCount))
                            : null);
                    Object firstRefundTransactions = ((Map<?, ?>) row.get("first")).get("refundTransactions");
                    Object secondRefundTransactions = ((Map<?, ?>) row.get("second")).get("refundTransactions");
                    row.put("refundTransactions", firstRefundTransactions instanceof Number firstCount
                            && secondRefundTransactions instanceof Number secondCount
                            ? ReportQueryService.toDecimal(firstCount).add(ReportQueryService.toDecimal(secondCount))
                            : null);
                    String firstSource = normalizedDataSource(first);
                    String secondSource = normalizedDataSource(second);
                    row.put("dataSource", firstSource != null && firstSource.equals(secondSource)
                            ? firstSource : null);
                    row.put("reportDataStatus", comparisonStatus(first, second));
                    row.put("dataAsOf", latestDataAsOf(first, second));
                    result = new NativeAiReportQueryService.Result(List.of(row), null);
                } catch (RuntimeException e) {
                    result = new NativeAiReportQueryService.Result(List.of(), "NATIVE_REPORT_UNAVAILABLE");
                }
            }
        } else if ("report_sales".equals(intent) && hasCategory && asksProfit) {
            result = new NativeAiReportQueryService.Result(List.of(), "NATIVE_REPORT_UNSUPPORTED");
        } else if ("report_sales".equals(intent) && !hasCategory
                && tenant.requireOutletId() != null && tenant.canQueryReport()) {
            try {
                Map<String, Object> overview = reportQueryService.nativeOverview(tenant.vendorId(),
                        tenant.requireOutletId(), window.from().toLocalDate(),
                        window.toExclusive().minusNanos(1).toLocalDate());
                Map<String, Object> row = salesMetrics(overview, tenant.canQueryCost());
                result = new NativeAiReportQueryService.Result(List.of(row), null);
            } catch (RuntimeException e) {
                result = new NativeAiReportQueryService.Result(List.of(), "NATIVE_REPORT_UNAVAILABLE");
            }
        } else {
            result = queryService.query(tenant, intent, ReportGraphState.slots(state), window);
        }

        Map<String, Object> out = new HashMap<>();
        out.put("sql_path", "orithos_template");
        out.put("sql", "");
        out.put("sql_raw", "");
        out.put("sql_params", List.of());
        out.put("sql_error", result.error() == null ? "" : result.error());
        out.put("report_rows", result.rows());
        out.put("report_columns", result.rows().isEmpty()
                ? List.of() : List.copyOf(result.rows().get(0).keySet()));
        boolean noData = result.rows().isEmpty() || result.rows().stream().anyMatch(row -> {
            boolean noSales = row.get("transactions") instanceof Number transactions
                    && transactions.doubleValue() == 0;
            boolean hasRefunds = row.get("refundTransactions") instanceof Number refunds
                    && refunds.doubleValue() > 0;
            return (noSales || row.get("tickets") instanceof Number tickets && tickets.doubleValue() == 0)
                    && !hasRefunds;
        });
        var syncSnapshot = "report_dead_stock".equals(intent) && syncWatermark != null
                && tenant.canQueryReport() && tenant.requireOutletId() != null
                ? syncWatermark.read(tenant, window.from().toLocalDate(),
                        window.toExclusive().minusNanos(1).toLocalDate())
                : java.util.Optional.<ShopfrontSyncWatermark.Snapshot>empty();
        String dataAsOf = "report_dead_stock".equals(intent)
                ? syncSnapshot.map(snapshot -> snapshot.syncedAt().toString()).orElse(null)
                : result.dataAsOf() == null ? latestDataAsOf(result.rows()) : result.dataAsOf();
        String rowStatus = reportDataStatus(result.rows());
        String reportSource = dataSource(result.rows(), result.dataSource());
        boolean deadStockFreshnessUnverified = "report_dead_stock".equals(intent)
                && syncSnapshot.map(snapshot -> !snapshot.fresh()
                        || !snapshot.covers(window.from().toLocalDate(),
                        window.toExclusive().minusNanos(1).toLocalDate())).orElse(true);
        String dataStatus = result.error() != null ? "unavailable"
                : "unavailable".equals(rowStatus) ? "unavailable"
                : deadStockFreshnessUnverified ? "incomplete"
                : hasConflictingDataSources(result.rows(), result.dataSource()) ? "incomplete"
                : reportSource == null ? "incomplete"
                : noData || "no_data".equals(rowStatus) ? "no_data"
                : "incomplete".equals(rowStatus) || dataAsOf == null ? "incomplete" : "available";
        addProvenance(out, window, dataStatus, dataAsOf, reportSource, timezone);
        return out;
    }

    private static Map<String, Object> salesMetrics(Map<String, Object> overview, boolean canViewCost) {
        Map<String, Object> metrics = new HashMap<>();
        String status = overview.get("reportDataStatus") == null ? null
                : overview.get("reportDataStatus").toString().trim().toLowerCase(java.util.Locale.ROOT);
        boolean hasData = !"no_data".equals(status) && !"unavailable".equals(status);
        metrics.put("sales", hasData ? overview.get("revenue") : null);
        metrics.put("grossSales", hasData ? overview.get("grossSales") : null);
        metrics.put("refunds", hasData ? overview.get("refunds") : null);
        metrics.put("refundTransactions", hasData ? overview.get("refundTransactions") : null);
        metrics.put("grossProfit", hasData && canViewCost ? overview.get("grossProfit") : null);
        metrics.put("costAvailable", canViewCost && Boolean.TRUE.equals(overview.get("costAvailable")));
        if (!canViewCost) metrics.put("profitUnavailableReason", "permission");
        else if (!Boolean.TRUE.equals(overview.get("taxAvailable"))) {
            metrics.put("profitUnavailableReason", "tax");
        }
        metrics.put("transactions", hasData ? overview.get("transactions") : null);
        metrics.put("dataAsOf", overview.get("dataAsOf"));
        metrics.put("dataSource", normalizedDataSource(overview));
        metrics.put("reportDataStatus", overview.get("reportDataStatus"));
        return metrics;
    }

    private static String reportDataStatus(List<Map<String, Object>> rows) {
        boolean incomplete = false;
        boolean noData = !rows.isEmpty();
        for (Map<String, Object> row : rows) {
            Object rawStatus = row.get("reportDataStatus");
            String status = rawStatus == null ? null
                    : rawStatus.toString().trim().toLowerCase(java.util.Locale.ROOT);
            if ("unavailable".equals(status)) return "unavailable";
            if ("incomplete".equals(status) || Boolean.FALSE.equals(row.get("costAvailable"))) incomplete = true;
            if (status != null && !status.isBlank()
                    && !List.of("available", "no_data", "incomplete", "unavailable").contains(status)) {
                incomplete = true;
            }
            if (!"no_data".equals(status)) noData = false;
        }
        if (incomplete) return "incomplete";
        return noData ? "no_data" : null;
    }

    private static String dataSource(List<Map<String, Object>> rows, String serviceSource) {
        java.util.Set<String> sources = new java.util.LinkedHashSet<>();
        if (serviceSource != null && !serviceSource.isBlank()) sources.add(serviceSource.trim());
        collectDataSources(rows, sources);
        return sources.size() == 1 ? sources.iterator().next() : null;
    }

    private static void collectDataSources(List<Map<String, Object>> rows, java.util.Set<String> sources) {
        for (Map<String, Object> row : rows) {
            Object rawSource = row.get("dataSource");
            if (rawSource instanceof String source && !source.isBlank()) sources.add(source.trim());
            for (String key : List.of("first", "second")) {
                Object nested = row.get(key);
                if (nested instanceof Map<?, ?> map) {
                    Object nestedSource = map.get("dataSource");
                    if (nestedSource instanceof String source && !source.isBlank()) sources.add(source.trim());
                }
            }
        }
    }

    private static boolean hasConflictingDataSources(List<Map<String, Object>> rows, String serviceSource) {
        java.util.Set<String> sources = new java.util.LinkedHashSet<>();
        if (serviceSource != null && !serviceSource.isBlank()) sources.add(serviceSource.trim());
        collectDataSources(rows, sources);
        return sources.size() > 1;
    }

    private static String normalizedDataSource(Map<String, Object> row) {
        Object rawSource = row.get("dataSource");
        return rawSource instanceof String source && !source.isBlank() ? source.trim() : null;
    }

    private static String comparisonStatus(Map<String, Object> first, Map<String, Object> second) {
        String firstSource = normalizedDataSource(first);
        String secondSource = normalizedDataSource(second);
        if (firstSource == null || secondSource == null || !firstSource.equals(secondSource)) return "incomplete";
        String firstStatus = reportDataStatus(List.of(first));
        String secondStatus = reportDataStatus(List.of(second));
        if ("unavailable".equals(firstStatus) || "unavailable".equals(secondStatus)) return "unavailable";
        if ("incomplete".equals(firstStatus) || "incomplete".equals(secondStatus)) return "incomplete";
        if ("no_data".equals(firstStatus) && "no_data".equals(secondStatus)) return "no_data";
        if ("no_data".equals(firstStatus) || "no_data".equals(secondStatus)) return "incomplete";
        if (latestDataAsOf(first, second) == null) return "incomplete";
        return "available";
    }

    private static void addProvenance(Map<String, Object> target, ReportPeriodResolver.Window window,
                                      String status, String dataAsOf, String dataSource, ZoneId timezone) {
        if (dataAsOf != null && !dataAsOf.isBlank()) target.put("report_data_as_of", dataAsOf);
        target.put("report_data_source", dataSource);
        target.put("report_store_scope", "current_authenticated_store");
        target.put("report_period_from", window.from().toLocalDate().toString());
        target.put("report_period_to", window.toExclusive().minusNanos(1).toLocalDate().toString());
        target.put("report_time_zone", timezone.getId());
        target.put("report_data_status", status);
    }

    private static String latestDataAsOf(List<Map<String, Object>> rows) {
        return rows.stream().map(row -> row.get("dataAsOf"))
                .filter(String.class::isInstance).map(String.class::cast)
                .filter(value -> !value.isBlank())
                .max(java.util.Comparator.comparing(Instant::parse)).orElse(null);
    }

    private static String latestDataAsOf(Map<String, Object> first, Map<String, Object> second) {
        return latestDataAsOf(List.of(first, second));
    }

    private ReportPeriodResolver.Window windowFromState(OverAllState state) {
        Object from = state.value("report_from").orElse(null);
        Object to = state.value("report_to").orElse(null);
        if (from instanceof LocalDateTime f && to instanceof LocalDateTime t) {
            Object daysRaw = ReportGraphState.slots(state).get("days");
            int days = 1;
            if (daysRaw != null) {
                try {
                    days = Integer.parseInt(daysRaw.toString());
                } catch (NumberFormatException ignored) {
                    // Keep the date span as the source of truth.
                }
            }
            return new ReportPeriodResolver.Window(f, t, days);
        }
        return periodResolver.resolve(ReportGraphState.slots(state), ReportGraphState.string(state, "question"));
    }
}
