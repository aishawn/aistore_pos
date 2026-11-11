package com.orithos.modules.ai.report;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.NodeAction;
import com.orithos.modules.report.ReportQueryService;
import org.springframework.stereotype.Component;

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

    public NativeReportQueryNode(NativeAiReportQueryService queryService, ReportPeriodResolver periodResolver,
                                 ReportQueryService reportQueryService) {
        this.queryService = queryService;
        this.periodResolver = periodResolver;
        this.reportQueryService = reportQueryService;
    }

    @Override
    public Map<String, Object> apply(OverAllState state) {
        String intent = ReportGraphState.string(state, "intent");
        ReportPeriodResolver.Window window = windowFromState(state);
        if ("report_adhoc".equals(intent)) {
            Map<String, Object> refused = new HashMap<>();
            refused.put("sql_path", "unsupported");
            refused.put("sql", "");
            refused.put("sql_raw", "");
            refused.put("sql_params", List.of());
            refused.put("sql_error", "NATIVE_REPORT_UNSUPPORTED");
            refused.put("report_rows", List.of());
            refused.put("report_columns", List.of());
            addProvenance(refused, window, "unavailable");
            return refused;
        }
        TenantContext tenant = ReportGraphState.tenant(state);
        NativeAiReportQueryService.Result result;
        boolean hasCategory = ReportGraphState.slots(state).containsKey("category");
        String question = ReportGraphState.string(state, "question");
        boolean asksProfit = question != null && question.matches("(?is).*(利润|毛利|profit|margin).*");
        if ("report_sales".equals(intent) && hasCategory && asksProfit) {
            result = new NativeAiReportQueryService.Result(List.of(), "NATIVE_REPORT_UNSUPPORTED");
        } else if ("report_sales".equals(intent) && !hasCategory
                && tenant.requireOutletId() != null && tenant.canQueryReport()) {
            try {
                Map<String, Object> overview = reportQueryService.nativeOverview(tenant.vendorId(),
                        tenant.requireOutletId(), window.from().toLocalDate(),
                        window.toExclusive().minusNanos(1).toLocalDate());
                Map<String, Object> row = new HashMap<>();
                row.put("sales", overview.get("revenue"));
                row.put("grossProfit", overview.get("grossProfit"));
                row.put("profitMargin", overview.get("profitMargin"));
                row.put("costAvailable", overview.get("costAvailable"));
                row.put("transactions", overview.get("transactions"));
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
        addProvenance(out, window, result.error() != null ? "unavailable" : noData ? "no_data" : "available");
        return out;
    }

    private static void addProvenance(Map<String, Object> target, ReportPeriodResolver.Window window,
                                      String status) {
        ZoneId timezone = com.orithos.common.AustraliaTime.ZONE;
        target.put("report_data_as_of", java.time.OffsetDateTime.now(timezone).toString());
        target.put("report_data_source", "orithos");
        target.put("report_store_scope", "current_authenticated_store");
        target.put("report_period_from", window.from().toLocalDate().toString());
        target.put("report_period_to", window.toExclusive().minusNanos(1).toLocalDate().toString());
        target.put("report_time_zone", timezone.getId());
        target.put("report_data_status", status);
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
