package com.orithos.modules.ai.report;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.NodeAction;
import com.orithos.modules.report.ReportQueryService;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.Instant;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class NativeReportQueryNode implements NodeAction {

    private final NativeAiReportQueryService queryService;
    private final ReportPeriodResolver periodResolver;
    private final ReportQueryService reportQueryService;

    public NativeReportQueryNode(NativeAiReportQueryService queryService, ReportPeriodResolver periodResolver,
                                 ReportQueryService reportQueryService) {
        this.queryService = queryService;
        this.periodResolver = periodResolver;
        this.reportQueryService = reportQueryService;
    }

    @Override
    public Map<String, Object> apply(OverAllState state) {
        String intent = ReportGraphState.string(state, "intent");
        String question = ReportGraphState.string(state, "question");
        var comparisonDates = ExplicitReportDates.parsePair(question);
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
            addProvenance(refused, window, "unavailable", null);
            return refused;
        }
        TenantContext tenant = ReportGraphState.tenant(state);
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
                    row.put("transactions", ReportQueryService.toDecimal(first.get("transactions"))
                            .add(ReportQueryService.toDecimal(second.get("transactions"))));
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
        boolean noData = result.rows().isEmpty() || result.rows().stream().anyMatch(row ->
                row.containsKey("transactions") && ReportQueryService.toDecimal(row.get("transactions")).signum() == 0
                || row.containsKey("tickets") && ReportQueryService.toDecimal(row.get("tickets")).signum() == 0);
        String dataAsOf = result.dataAsOf() == null ? latestDataAsOf(result.rows()) : result.dataAsOf();
        String dataStatus = result.error() != null ? "unavailable"
                : noData ? "no_data" : dataAsOf == null ? "incomplete" : "available";
        addProvenance(out, window, dataStatus, dataAsOf);
        return out;
    }

    private static Map<String, Object> salesMetrics(Map<String, Object> overview, boolean canViewCost) {
        Map<String, Object> metrics = new HashMap<>();
        metrics.put("sales", overview.get("revenue"));
        metrics.put("grossProfit", canViewCost ? overview.get("grossProfit") : null);
        metrics.put("costAvailable", canViewCost && Boolean.TRUE.equals(overview.get("costAvailable")));
        if (!canViewCost) metrics.put("profitUnavailableReason", "permission");
        metrics.put("transactions", overview.get("transactions"));
        metrics.put("dataAsOf", overview.get("dataAsOf"));
        return metrics;
    }

    private static void addProvenance(Map<String, Object> target, ReportPeriodResolver.Window window,
                                      String status, String dataAsOf) {
        ZoneId timezone = com.orithos.common.AustraliaTime.ZONE;
        if (dataAsOf != null && !dataAsOf.isBlank()) target.put("report_data_as_of", dataAsOf);
        target.put("report_data_source", "orithos_ledger");
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
