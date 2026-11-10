package com.orithos.modules.ai.report;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.NodeAction;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class OdooReportQueryNode implements NodeAction {

    private final NativeAiReportQueryService queryService;
    private final ReportPeriodResolver periodResolver;

    public OdooReportQueryNode(NativeAiReportQueryService queryService, ReportPeriodResolver periodResolver) {
        this.queryService = queryService;
        this.periodResolver = periodResolver;
    }

    @Override
    public Map<String, Object> apply(OverAllState state) {
        String intent = ReportGraphState.string(state, "intent");
        // Ad-hoc NL2SQL is not wired; surface a guided refusal.
        if ("report_adhoc".equals(intent)) {
            Map<String, Object> refused = new HashMap<>();
            refused.put("sql_path", "unsupported");
            refused.put("sql", "");
            refused.put("sql_raw", "");
            refused.put("sql_params", List.of());
            refused.put("sql_error", "NATIVE_REPORT_UNSUPPORTED");
            refused.put("report_rows", List.of());
            refused.put("report_columns", List.of());
            return refused;
        }
        ReportPeriodResolver.Window window = windowFromState(state);
        NativeAiReportQueryService.Result result = queryService.query(
                ReportGraphState.tenant(state), intent, ReportGraphState.slots(state), window);

        Map<String, Object> out = new HashMap<>();
        out.put("sql_path", "orithos_template");
        out.put("sql", "");
        out.put("sql_raw", "");
        out.put("sql_params", List.of());
        out.put("sql_error", result.error() == null ? "" : result.error());
        out.put("report_rows", result.rows());
        out.put("report_columns", result.rows().isEmpty()
                ? List.of() : List.copyOf(result.rows().get(0).keySet()));
        ZoneId timezone = com.orithos.common.AustraliaTime.ZONE;
        out.put("report_data_as_of", window.toExclusive().atZone(timezone).toOffsetDateTime().toString());
        out.put("report_data_source", "orithos");
        out.put("report_store_scope", "current_authenticated_store");
        return out;
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
