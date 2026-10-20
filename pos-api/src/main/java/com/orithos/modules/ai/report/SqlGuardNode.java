package com.orithos.modules.ai.report;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.NodeAction;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class SqlGuardNode implements NodeAction {

    private final SqlGuard sqlGuard;

    public SqlGuardNode(AiReportProperties properties) {
        this.sqlGuard = new SqlGuard(properties.getMaxRows());
    }

    @Override
    public Map<String, Object> apply(OverAllState state) {
        String existingError = ReportGraphState.string(state, "sql_error");
        if (existingError != null && !existingError.isBlank()) {
            return Map.of();
        }
        String sql = ReportGraphState.string(state, "sql");
        @SuppressWarnings("unchecked")
        List<Object> params = (List<Object>) state.value("sql_params").orElse(List.of());
        try {
            sqlGuard.validate(sql, ReportGraphState.tenant(state), params);
            return Map.of();
        } catch (SqlGuardException e) {
            return Map.of("sql_error", "SQL_GUARD_REJECTED");
        }
    }
}
