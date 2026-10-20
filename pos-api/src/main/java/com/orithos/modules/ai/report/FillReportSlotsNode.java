package com.orithos.modules.ai.report;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.NodeAction;
import org.springframework.stereotype.Component;

import java.time.format.DateTimeFormatter;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;

@Component
public class FillReportSlotsNode implements NodeAction {

    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE;

    private final ReportPeriodResolver periodResolver;
    private final OdooReportQueryService odooReportQueryService;
    private final AiReportQuotaService quotaService;

    public FillReportSlotsNode(ReportPeriodResolver periodResolver,
                               OdooReportQueryService odooReportQueryService,
                               AiReportQuotaService quotaService) {
        this.periodResolver = periodResolver;
        this.odooReportQueryService = odooReportQueryService;
        this.quotaService = quotaService;
    }

    @Override
    public Map<String, Object> apply(OverAllState state) {
        Map<String, String> slots = new HashMap<>(ReportGraphState.slots(state));
        String question = ReportGraphState.string(state, "question");
        String intent = ReportGraphState.string(state, "intent");
        String category = ReportTemplateRegistry.sanitizeCategory(slots.get("category"));
        if (category == null) {
            slots.remove("category");
        } else {
            slots.put("category", category);
        }
        int defaultDays = "report_dead_stock".equals(intent) ? 30 : 1;
        TenantContext tenant = ReportGraphState.tenant(state);
        ZoneId timezone = odooReportQueryService.businessTimezone(tenant);
        ReportPeriodResolver.Window window = periodResolver.resolve(slots, question, defaultDays, timezone);
        slots.put("from", window.from().toLocalDate().format(ISO));
        slots.put("to", window.toExclusive().minusSeconds(1).toLocalDate().format(ISO));
        if ("report_dead_stock".equals(intent)) {
            int days = (int) (window.toExclusive().toLocalDate().toEpochDay()
                    - window.from().toLocalDate().toEpochDay());
            slots.put("days", String.valueOf(Math.max(1, days)));
        } else if (!slots.containsKey("days") || slots.get("days") == null || slots.get("days").isBlank()) {
            int days = window.days() > 0 ? window.days() : 30;
            slots.put("days", String.valueOf(days));
        }
        Map<String, Object> out = new HashMap<>();
        out.put("slots", slots);
        out.put("report_from", window.from());
        out.put("report_to", window.toExclusive());
        out.put("report_t0", System.currentTimeMillis());
        out.put("sql_error", "");
        Long outletId = tenant.requireOutletId();
        if (outletId != null) {
            try {
                quotaService.acquire(outletId, 1, AiReportQuotaService.estimateTokens(question));
            } catch (SqlGuardException e) {
                out.put("sql_error", "QUOTA_EXCEEDED");
            }
        }
        return out;
    }
}
