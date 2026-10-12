package com.orithos.modules.ai.report;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.NodeAction;
import com.orithos.modules.ai.configstore.IntentConfigService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Narrow NL2SQL: model emits one SELECT over ai_rpt_* views; tenant filters are bound in code.
 */
public class Nl2SqlGenerateNode implements NodeAction {

    private static final Logger log = LoggerFactory.getLogger(Nl2SqlGenerateNode.class);
    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    public static final String FALLBACK_PROMPT = """
            You write ONE MySQL SELECT for Orithos POS reporting.
            Allowed tables only:
            - ai_rpt_sale_item (completed sale lines): outlet_id, sold_at, business_date, product_id, qty, amount, customer_id, sale_id
            - ai_rpt_product (no purchase cost): id, outlet_id, name, status, category_id, category_name
            - ai_rpt_inventory (on-hand): product_id, outlet_id, quantity, reorder_level, on_order
            - ai_rpt_customer_sale (one row per completed sale): sale_id, outlet_id, sold_at, business_date, customer_id, amount
            Rules:
            - Output SQL only (optional ```sql fence). No explanation.
            - Never mention or filter outlet_id / vendor_id / store id; the server injects them on every table scan.
            - Never select or guess cost, last_cost, average_cost, profit, or purchase price.
            - sold_at and business_date are Australia/Sydney civil time (AEST/AEDT), not UTC.
              Prefer business_date (DATE, yyyy-MM-dd) for a whole day so daylight saving does not drop sales.
              Use ISO datetime literals for sold_at. Do not use JDBC '?' placeholders.
            - Single statement. UNION / WITH / subqueries are allowed; no comments, INTO OUTFILE, or writes.
            - Prefer LIMIT 50 or less.
            - Catalogue names are English. 啤酒/啤酒类 means beer / Beer Local; 可乐 means cola / Coca Cola.
              Always match both scripts, e.g. (p.category_name LIKE '%Beer%' OR p.category_name LIKE '%啤酒%'
              OR p.name LIKE '%Beer%' OR p.name LIKE '%啤酒%'). Never filter only on the Chinese token.
            """;

    private final ChatClient chatClient;
    private final IntentConfigService configService;
    private final SqlTenantBinder binder;
    private final AiReportQuotaService quotaService;

    public Nl2SqlGenerateNode(ChatClient chatClient,
                              IntentConfigService configService,
                              SqlTenantBinder binder,
                              AiReportQuotaService quotaService) {
        this.chatClient = chatClient;
        this.configService = configService;
        this.binder = binder;
        this.quotaService = quotaService;
    }

    @Override
    public Map<String, Object> apply(OverAllState state) {
        Map<String, Object> out = new HashMap<>();
        out.put("sql_path", "nl2sql");
        String existing = ReportGraphState.string(state, "sql_error");
        if (existing != null && !existing.isBlank()) {
            return Map.of();
        }
        TenantContext tenant = ReportGraphState.tenant(state);
        if (tenant.requireOutletId() == null) {
            out.put("sql_error", "NO_OUTLET");
            out.put("sql", "");
            out.put("sql_params", List.of());
            return out;
        }
        if (!tenant.canQueryReport()) {
            out.put("sql_error", "NO_PERMISSION");
            out.put("sql", "");
            out.put("sql_params", List.of());
            return out;
        }

        String question = ReportGraphState.string(state, "question");
        Map<String, String> slots = ReportGraphState.slots(state);
        String system = configService.getSnapshot()
                .promptContent(IntentConfigService.PROMPT_NL2SQL, FALLBACK_PROMPT);
        String user = buildUserPrompt(question, slots, state);

        String raw;
        try {
            raw = chatClient.prompt().system(system).user(user).call().content();
            Long outletId = tenant.requireOutletId();
            if (outletId != null && quotaService != null) {
                quotaService.acquire(outletId, 0, AiReportQuotaService.estimateTokens(system, user, raw));
            }
        } catch (SqlGuardException e) {
            out.put("sql_error", e.getMessage());
            out.put("sql_raw", "");
            out.put("sql", "");
            out.put("sql_params", List.of());
            return out;
        } catch (Exception e) {
            log.warn("NL2SQL generate failed: {}", e.getMessage());
            out.put("sql_error", "NL2SQL_FAILED");
            out.put("sql_raw", "");
            out.put("sql", "");
            out.put("sql_params", List.of());
            return out;
        }

        String extracted = CategoryLexicon.expandLikePredicates(SqlTenantBinder.extractSelect(raw));
        out.put("sql_raw", extracted == null ? (raw == null ? "" : raw) : extracted);
        if (extracted == null) {
            out.put("sql_error", "NL2SQL_EMPTY");
            out.put("sql", "");
            out.put("sql_params", List.of());
            return out;
        }
        try {
            SqlTenantBinder.BoundSql bound = binder.bind(extracted, tenant);
            out.put("sql", bound.sql());
            out.put("sql_params", bound.params());
            out.put("sql_error", "");
            log.info("NL2SQL generated sql={} params={}", bound.sql(), bound.params());
            return out;
        } catch (SqlGuardException e) {
            out.put("sql_error", "GUARD:" + e.getMessage());
            out.put("sql", "");
            out.put("sql_params", List.of());
            return out;
        }
    }

    private static String buildUserPrompt(String question, Map<String, String> slots, OverAllState state) {
        String from = slots.getOrDefault("from", "");
        String to = slots.getOrDefault("to", "");
        String category = slots.getOrDefault("category", "");
        String query = slots.getOrDefault("query", "");
        String categoryHint = category.isBlank()
                ? "(none)"
                : category + " (also match: " + String.join(", ", CategoryLexicon.searchTerms(category)) + ")";
        Object fromTs = state.value("report_from").orElse(null);
        Object toTs = state.value("report_to").orElse(null);
        String fromLit = fromTs instanceof LocalDateTime f ? f.format(TS) : from + " 00:00:00";
        String toLit = toTs instanceof LocalDateTime t ? t.format(TS) : to + " 23:59:59";
        return """
                Resolved period (inclusive start, exclusive end): %s .. %s
                Optional category slot: %s
                Optional product query slot: %s

                Few-shot:
                Q: 上周五啤酒类卖了多少
                A: SELECT SUM(si.qty) AS qty, SUM(si.amount) AS sales
                FROM ai_rpt_sale_item si
                JOIN ai_rpt_product p ON p.id = si.product_id
                WHERE si.business_date >= '%s' AND si.business_date < '%s'
                  AND (p.category_name LIKE '%%Beer%%' OR p.category_name LIKE '%%啤酒%%' OR p.name LIKE '%%Beer%%' OR p.name LIKE '%%啤酒%%')
                LIMIT 50

                Q: how many tickets yesterday
                A: SELECT COUNT(*) AS tickets FROM ai_rpt_customer_sale
                WHERE business_date >= '%s' AND business_date < '%s'
                LIMIT 1

                User question:
                ---
                %s
                ---
                """.formatted(fromLit, toLit,
                categoryHint,
                query.isBlank() ? "(none)" : query,
                fromLit, toLit, fromLit, toLit, question == null ? "" : question);
    }
}
