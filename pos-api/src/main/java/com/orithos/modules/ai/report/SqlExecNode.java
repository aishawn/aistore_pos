package com.orithos.modules.ai.report;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.NodeAction;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class SqlExecNode implements NodeAction {

    private static final Logger log = LoggerFactory.getLogger(SqlExecNode.class);

    private final AiReportDataSourceRegistry registry;
    private final JdbcTemplate primaryJdbc;
    private final AiReportProperties properties;

    public SqlExecNode(
            AiReportDataSourceRegistry registry,
            JdbcTemplate primaryJdbc,
            AiReportProperties properties) {
        this.registry = registry;
        this.primaryJdbc = primaryJdbc;
        this.properties = properties;
    }

    @Override
    public Map<String, Object> apply(OverAllState state) {
        String error = ReportGraphState.string(state, "sql_error");
        if (error != null && !error.isBlank()) {
            return Map.of("report_rows", List.of(), "report_columns", List.of());
        }
        String sql = ReportGraphState.string(state, "sql");
        if (sql == null || sql.isBlank()) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("sql_error", "EMPTY_SQL");
            out.put("report_rows", List.of());
            out.put("report_columns", List.of());
            return out;
        }
        TenantContext tenant = ReportGraphState.tenant(state);
        Long outletId = tenant.requireOutletId();
        if (outletId == null) {
            return errorResult("NO_OUTLET");
        }
        @SuppressWarnings("unchecked")
        List<Object> params = (List<Object>) state.value("sql_params").orElse(List.of());
        Object[] args = params.toArray();
        try {
            List<Map<String, Object>> rows = query(registry.jdbc(outletId), sql, args);
            return result(rows);
        } catch (Exception e) {
            if (!properties.isFallbackToPrimary()) {
                log.warn("AI report tenant RO query failed outletId={} type={}", outletId,
                        e.getClass().getSimpleName());
                return errorResult("EXEC_QUERY_FAILED");
            }
            try {
                log.warn("AI report RO query failed, falling back to primary DS type={}",
                        e.getClass().getSimpleName());
                List<Map<String, Object>> rows = query(primaryJdbc, sql, args);
                return result(rows);
            } catch (Exception e2) {
                log.warn("AI report primary fallback failed type={}", e2.getClass().getSimpleName());
                return errorResult("EXEC_QUERY_FAILED");
            }
        }
    }

    private List<Map<String, Object>> query(JdbcTemplate jdbc, String sql, Object[] args) {
        return jdbc.queryForList(sql, args);
    }

    private Map<String, Object> result(List<Map<String, Object>> rows) {
        List<String> columns = new ArrayList<>();
        List<Map<String, Object>> copy = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> line = ReportJsonCells.copyRow(row);
            line.keySet().forEach(k -> {
                if (!columns.contains(k)) {
                    columns.add(k);
                }
            });
            copy.add(line);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("report_rows", copy);
        out.put("report_columns", columns);
        out.put("sql_error", "");
        return out;
    }

    private Map<String, Object> errorResult(String error) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("sql_error", error);
        out.put("report_rows", List.of());
        out.put("report_columns", List.of());
        return out;
    }
}
