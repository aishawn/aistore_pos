package com.orithos.modules.ai.report;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.NodeAction;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class BindTemplateSqlNode implements NodeAction {

    private final ReportTemplateRegistry registry;
    private final ReportPeriodResolver periodResolver;

    public BindTemplateSqlNode(ReportTemplateRegistry registry, ReportPeriodResolver periodResolver) {
        this.registry = registry;
        this.periodResolver = periodResolver;
    }

    @Override
    public Map<String, Object> apply(OverAllState state) {
        String existing = ReportGraphState.string(state, "sql_error");
        if (existing != null && !existing.isBlank()) {
            return Map.of();
        }
        String intent = ReportGraphState.string(state, "intent");
        Map<String, String> slots = ReportGraphState.slots(state);
        TenantContext tenant = ReportGraphState.tenant(state);
        ReportPeriodResolver.Window window = windowFromState(state, slots);
        ReportTemplateRegistry.BoundSql bound = registry.bind(intent, tenant, slots, window);

        Map<String, Object> out = new HashMap<>();
        out.put("sql_path", "template");
        out.put("sql", bound.sql() == null ? "" : bound.sql());
        out.put("sql_raw", bound.sql() == null ? "" : bound.sql());
        out.put("sql_params", bound.params() == null ? List.of() : bound.params());
        out.put("sql_error", bound.error() == null ? "" : bound.error());
        return out;
    }

    private ReportPeriodResolver.Window windowFromState(OverAllState state, Map<String, String> slots) {
        Object from = state.value("report_from").orElse(null);
        Object to = state.value("report_to").orElse(null);
        if (from instanceof LocalDateTime f && to instanceof LocalDateTime t) {
            int days = 30;
            try {
                days = Integer.parseInt(slots.getOrDefault("days", "30"));
            } catch (NumberFormatException ignored) {
                // keep default
            }
            return new ReportPeriodResolver.Window(f, t, days);
        }
        return periodResolver.resolve(slots, ReportGraphState.string(state, "question"));
    }
}
