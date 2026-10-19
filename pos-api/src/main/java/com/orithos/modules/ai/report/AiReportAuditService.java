package com.orithos.modules.ai.report;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

@Component
public class AiReportAuditService {

    private static final Logger log = LoggerFactory.getLogger(AiReportAuditService.class);

    private final AiReportAuditMapper mapper;

    public AiReportAuditService(AiReportAuditMapper mapper) {
        this.mapper = mapper;
    }

    public void record(OverAllState state) {
        try {
            TenantContext tenant = ReportGraphState.tenant(state);
            String error = ReportGraphState.string(state, "sql_error");
            boolean allowed = error == null || error.isBlank();
            String sql = firstNonBlank(
                    ReportGraphState.string(state, "sql"),
                    ReportGraphState.string(state, "sql_raw"));
            String path = ReportGraphState.string(state, "sql_path");
            if (path == null || path.isBlank()) {
                path = "template";
            }
            Object rowsObj = state.value("report_rows").orElse(List.of());
            int rowCount = rowsObj instanceof List<?> list ? list.size() : 0;
            Integer latency = null;
            Object t0 = state.value("report_t0").orElse(null);
            if (t0 instanceof Number n) {
                latency = (int) Math.max(0, System.currentTimeMillis() - n.longValue());
            }
            String question = ReportGraphState.string(state, "question");
            String outlets = tenant.outletIds() == null ? null
                    : tenant.outletIds().stream().map(String::valueOf).collect(Collectors.joining(","));
            mapper.insert(
                    tenant.vendorId(),
                    tenant.userId(),
                    tenant.currentOutletId(),
                    outlets,
                    question,
                    sql,
                    path,
                    allowed,
                    allowed ? null : error,
                    allowed ? rowCount : null,
                    latency,
                    AiReportQuotaService.estimateTokens(question, sql)
            );
            log.info("AI report audit path={} allowed={} sql={}", path, allowed, sql);
        } catch (DataAccessException e) {
            log.warn("AI report audit insert skipped: {}", e.getMessage());
        } catch (Exception e) {
            log.warn("AI report audit skipped: {}", e.getMessage());
        }
    }

    /**
     * Records a generic assistant request without retaining the user's question
     * or generated answer. The path contains only the classified intent.
     */
    public void recordAssistant(TenantContext tenant, String intent, boolean allowed,
                                Integer latencyMs, String question, String answer) {
        if (tenant == null) return;
        try {
            String normalizedIntent = intent == null || intent.isBlank() ? "unknown" : intent.trim();
            String path = "assistant:" + normalizedIntent;
            if (path.length() > 32) path = path.substring(0, 32);
            String outlets = tenant.outletIds() == null ? null
                    : tenant.outletIds().stream().map(String::valueOf).collect(Collectors.joining(","));
            mapper.insert(
                    tenant.vendorId(),
                    tenant.userId(),
                    tenant.currentOutletId(),
                    outlets,
                    null,
                    null,
                    path,
                    allowed,
                    allowed ? null : "ASSISTANT_FAILED",
                    null,
                    latencyMs,
                    AiReportQuotaService.estimateTokens(question, answer)
            );
        } catch (Exception e) {
            log.warn("AI assistant audit skipped: {}", e.getMessage());
        }
    }

    private static String firstNonBlank(String a, String b) {
        if (a != null && !a.isBlank()) {
            return a;
        }
        if (b != null && !b.isBlank()) {
            return b;
        }
        return null;
    }
}
