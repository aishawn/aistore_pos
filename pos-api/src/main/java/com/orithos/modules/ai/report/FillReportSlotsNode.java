package com.orithos.modules.ai.report;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.NodeAction;
import org.springframework.stereotype.Component;

import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

@Component
public class FillReportSlotsNode implements NodeAction {

    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE;

    private final ReportPeriodResolver periodResolver;
    private final AiReportQuotaService quotaService;
    private final AiReportProperties reportProperties;

    public FillReportSlotsNode(ReportPeriodResolver periodResolver, AiReportQuotaService quotaService,
                               AiReportProperties reportProperties) {
        this.periodResolver = periodResolver;
        this.quotaService = quotaService;
        this.reportProperties = reportProperties;
    }

    @Override
    public Map<String, Object> apply(OverAllState state) {
        Map<String, String> slots = new HashMap<>(ReportGraphState.slots(state));
        String question = ReportGraphState.string(state, "question");
        String category = ReportTemplateRegistry.sanitizeCategory(slots.get("category"));
        if (category == null) {
            slots.remove("category");
        } else {
            slots.put("category", category);
        }
        ReportPeriodResolver.Window window = periodResolver.resolve(slots, question);
        slots.put("from", window.from().toLocalDate().format(ISO));
        slots.put("to", window.toExclusive().minusSeconds(1).toLocalDate().format(ISO));
        if (!slots.containsKey("days") || slots.get("days") == null || slots.get("days").isBlank()) {
            int days = window.days() > 0 ? window.days() : 30;
            slots.put("days", String.valueOf(days));
        }
        Map<String, Object> out = new HashMap<>();
        String intent = ReportGraphState.string(state, "intent");
        if (reportProperties != null && reportProperties.isForceNl2sql()
                && (ReportTemplateRegistry.TEMPLATE_INTENTS.contains(intent)
                || "report_adhoc".equals(intent))) {
            out.put("intent", "report_adhoc");
        }
        out.put("slots", slots);
        out.put("report_from", window.from());
        out.put("report_to", window.toExclusive());
        out.put("report_t0", System.currentTimeMillis());
        out.put("sql_error", "");
        Long outletId = ReportGraphState.tenant(state).requireOutletId();
        if (outletId != null) {
            try {
                quotaService.acquire(outletId, 1, AiReportQuotaService.estimateTokens(question));
            } catch (SqlGuardException e) {
                out.put("sql_error", e.getMessage());
            }
        }
        return out;
    }
}
