package com.orithos.modules.ai.report;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.NodeAction;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class OdooReportQueryNode implements NodeAction {

    private final OdooReportQueryService queryService;
    private final ReportPeriodResolver periodResolver;

    public OdooReportQueryNode(OdooReportQueryService queryService, ReportPeriodResolver periodResolver) {
        this.queryService = queryService;
        this.periodResolver = periodResolver;
    }

    @Override
    public Map<String, Object> apply(OverAllState state) {
        String intent = ReportGraphState.string(state, "intent");
        // Ad-hoc NL2SQL is not wired; skip Odoo entirely and surface a guided refusal.
        if ("report_adhoc".equals(intent)) {
            Map<String, Object> refused = new HashMap<>();
            refused.put("sql_path", "unsupported");
            refused.put("sql", "");
            refused.put("sql_raw", "");
            refused.put("sql_params", List.of());
            refused.put("sql_error", "ODOO_REPORT_UNSUPPORTED");
            refused.put("report_rows", List.of());
            refused.put("report_columns", List.of());
            return refused;
        }
        ReportPeriodResolver.Window window = windowFromState(state);
        OdooReportQueryService.Result result = queryService.query(
                ReportGraphState.tenant(state), intent, ReportGraphState.slots(state), window);

        Map<String, Object> out = new HashMap<>();
        out.put("sql_path", "odoo");
        out.put("sql", "");
        out.put("sql_raw", "");
        out.put("sql_params", List.of());
        out.put("sql_error", result.error() == null ? "" : result.error());
        out.put("report_rows", result.rows());
        out.put("report_columns", result.rows().isEmpty()
                ? List.of() : List.copyOf(result.rows().get(0).keySet()));
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
