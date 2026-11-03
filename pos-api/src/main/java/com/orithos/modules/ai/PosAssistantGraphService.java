package com.orithos.modules.ai;

import com.alibaba.cloud.ai.graph.CompiledGraph;
import com.alibaba.cloud.ai.graph.NodeOutput;
import com.alibaba.cloud.ai.graph.RunnableConfig;
import com.alibaba.cloud.ai.graph.state.StateSnapshot;
import com.orithos.config.CorrelationIdContext;
import com.orithos.modules.ai.context.FollowUpSupport;
import com.orithos.modules.ai.context.StoreContextPack;
import com.orithos.modules.ai.context.StoreContextPackAssembler;
import com.orithos.modules.ai.dto.AssistantCard;
import com.orithos.modules.ai.dto.AssistantCardCta;
import com.orithos.modules.ai.dto.ReportTable;
import com.orithos.modules.ai.dto.UiAction;
import com.orithos.modules.ai.report.AiReportSnapshotService;
import com.orithos.modules.ai.report.ReportJsonCells;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Graph-backed NLQ assistant. Bound to {@code app.ai.enabled} (not {@code @ConditionalOnBean})
 * so registration is not skipped when {@link CompiledGraph} is defined later in the same context.
 */
@Service
@ConditionalOnProperty(name = "app.ai.enabled", havingValue = "true")
public class PosAssistantGraphService {

    private final CompiledGraph posAssistantGraph;
    private final AiReportSnapshotService snapshotService;
    private final AiConversationMemory conversationMemory;
    private final StoreContextPackAssembler contextPackAssembler;
    private final AiProperties properties;

    public PosAssistantGraphService(CompiledGraph posAssistantGraph,
                                    AiReportSnapshotService snapshotService,
                                    AiConversationMemory conversationMemory,
                                    StoreContextPackAssembler contextPackAssembler,
                                    AiProperties properties) {
        this.posAssistantGraph = posAssistantGraph;
        this.snapshotService = snapshotService;
        this.conversationMemory = conversationMemory;
        this.contextPackAssembler = contextPackAssembler;
        this.properties = properties;
    }

    public AssistantResult ask(String question, String threadId, TenantContext tenant) {
        return ask(question, threadId, tenant, null);
    }

    public AssistantResult ask(String question, String threadId, TenantContext tenant, String surface) {
        String effectiveThreadId = resolveThreadId(threadId, tenant);
        String history = conversationMemory.formatHistory(effectiveThreadId);
        StoreContextPack pack = contextPackAssembler.assemble(
                tenant, effectiveThreadId, FollowUpSupport.normalizeSurface(surface));

        RunnableConfig config = RunnableConfig.builder()
                .threadId(effectiveThreadId)
                .build();

        Map<String, Object> initialState = new HashMap<>();
        initialState.put("question", question);
        initialState.put("conversation_history", history == null ? "" : history);
        initialState.put("store_context", pack.promptSummary());
        initialState.put("last_intent", pack.lastIntent());
        initialState.put("last_slots", pack.lastSlots());
        initialState.put("ui_surface", pack.surface());
        initialState.put(CorrelationIdContext.STATE_KEY, CorrelationIdContext.current());
        if (tenant != null) {
            initialState.put("vendor_id", tenant.vendorId());
            initialState.put("user_id", tenant.userId());
            initialState.put("outlet_id", tenant.currentOutletId());
            initialState.put("outlet_ids", tenant.outletIds() == null ? List.of() : tenant.outletIds());
            initialState.put("can_report_query", tenant.canQueryReport());
            initialState.put("can_report_cost", tenant.canQueryCost());
        }

        AssistantTenantContext.set(tenant);
        try {
            Flux<NodeOutput> stream = posAssistantGraph.stream(initialState, config);
            stream.blockLast(Duration.ofSeconds(Math.max(5, properties.timeoutSeconds())));

            StateSnapshot snapshot = posAssistantGraph.getState(config);
            Map<String, Object> data = snapshot.state().data();

            Map<String, String> slots = Collections.emptyMap();
            Object slotsObj = data.get("slots");
            if (slotsObj instanceof Map<?, ?> m) {
                Map<String, String> copy = new LinkedHashMap<>();
                m.forEach((k, v) -> {
                    if (k != null && v != null) {
                        copy.put(k.toString(), v.toString());
                    }
                });
                slots = copy;
            }

            UiAction ui = new UiAction(
                    emptyToNull(stringValue(data, "ui_panel")),
                    emptyToNull(stringValue(data, "ui_view")),
                    emptyToNull(stringValue(data, "ui_route")),
                    emptyToNull(stringValue(data, "ui_action"))
            );

            ReportTable table = tableFrom(data);
            String answer = stringValue(data, "answer");
            String intent = stringValue(data, "intent");
            String fastPathId = stringValue(data, "fast_path_id");
            String source = stringValue(data, "route_source");
            boolean llmFallback = Boolean.parseBoolean(stringValue(data, "llm_fallback"));
            Long reportId = snapshotService.save(tenant, intent, question, answer, table, slots);
            String dataAsOf = stringValue(data, "report_data_as_of");
            String dataSource = stringValue(data, "report_data_source");
            String storeScope = stringValue(data, "report_store_scope");
            List<AssistantCard> cards = cardsFor(intent, ui, answer, question, fastPathId);
            Object assistantCard = data.get("assistant_card");
            if (assistantCard instanceof AssistantCard card) {
                List<AssistantCard> combined = new ArrayList<>(cards);
                combined.removeIf(existing -> existing.type().equals(card.type()));
                combined.add(card);
                cards = List.copyOf(combined);
            }

            conversationMemory.append(effectiveThreadId, question, intent, answer, slots);
            conversationMemory.saveLastSlots(effectiveThreadId, intent, slots);

            return new AssistantResult(
                    effectiveThreadId,
                    intent,
                    stringValue(data, "intent_summary"),
                    answer,
                    slots,
                    ui,
                    table,
                    reportId,
                    cards,
                    List.of(),
                    fastPathId,
                    source,
                    llmFallback,
                    dataAsOf,
                    dataSource,
                    storeScope
            );
        } finally {
            AssistantTenantContext.clear();
        }
    }

    private static ReportTable tableFrom(Map<String, Object> data) {
        Object cols = data.get("report_columns");
        Object rows = data.get("report_rows");
        if (!(cols instanceof List<?> colList) || !(rows instanceof List<?> rowList) || rowList.isEmpty()) {
            return null;
        }
        List<String> columns = new ArrayList<>();
        for (Object c : colList) {
            if (c != null) {
                columns.add(c.toString());
            }
        }
        List<Map<String, Object>> tableRows = new ArrayList<>();
        for (Object r : rowList) {
            if (r instanceof Map<?, ?> m) {
                Map<String, Object> copy = new LinkedHashMap<>();
                m.forEach((k, v) -> {
                    if (k != null) {
                        copy.put(k.toString(), ReportJsonCells.toJsonValue(v));
                    }
                });
                tableRows.add(copy);
            }
        }
        if (columns.isEmpty() || tableRows.isEmpty()) {
            return null;
        }
        return new ReportTable(columns, tableRows);
    }

    static String resolveThreadId(String threadId, TenantContext tenant) {
        String session = (threadId == null || threadId.isBlank()) ? UUID.randomUUID().toString() : threadId.trim();
        if (tenant == null) {
            return session;
        }
        String prefix = tenant.vendorId() + ":" + tenant.userId() + ":";
        if (session.startsWith(prefix)) {
            return session;
        }
        return prefix + session;
    }

    private static String stringValue(Map<String, Object> data, String key) {
        Object value = data.get(key);
        return value == null ? null : value.toString();
    }

    static List<AssistantCard> cardsFor(String intent, UiAction ui, String answer) {
        return cardsFor(intent, ui, answer, null);
    }

    static List<AssistantCard> cardsFor(String intent, UiAction ui, String answer, String question) {
        return cardsFor(intent, ui, answer, question, null);
    }

    static List<AssistantCard> cardsFor(
            String intent, UiAction ui, String answer, String question, String fastPathId) {
        String route = ui == null ? null : ui.route();
        String type = "historical_stock_unavailable".equals(fastPathId) ? "stock_history"
                : "product_count".equals(intent) ? "product_count"
                : "guided_action".equals(intent) ? "guided_action"
                : "/sommelier".equals(route) ? "sommelier"
                : "/recommend/grocery".equals(route) ? "recommend"
                : "/stock/replenishment".equals(route) ? "replenishment"
                : "/stock/capped-pricing".equals(route) ? "pricing" : null;
        if (type == null) return List.of();

        String text = answer == null ? "" : answer;
        String lower = text.toLowerCase(java.util.Locale.ROOT);
        boolean unavailable = "stock_history".equals(type)
                || answer == null || answer.isBlank() || lower.contains("unavailable")
                || lower.contains("not available") || lower.contains("不可用")
                || lower.contains("无法取得") || lower.contains("无法获取")
                || lower.contains("暂时无法") || lower.contains("无法查询")
                || lower.contains("not configured") || lower.contains("尚未配置 odoo")
                || lower.contains("未配置 odoo")
                || lower.contains("请先登录") || lower.contains("尚未绑定")
                || lower.contains("未绑定门店") || lower.contains("sign in")
                || lower.contains("not bound") || lower.contains("permission")
                || lower.contains("没有权限") || lower.contains("无权限")
                || lower.contains("权限不足") || lower.contains("无法访问");
        boolean empty = !unavailable && ("product_count".equals(type) && productCountIsZero(text)
                || lower.contains("no restock")
                || lower.contains("no items need")
                || lower.contains("no products need")
                || lower.contains("no wine products")
                || lower.contains("nothing in stock matches")
                || lower.contains("could not pick")
                || lower.contains("no matching")
                || lower.contains("没有推荐")
                || lower.contains("没有补货数量建议")
                || lower.contains("没有补货建议")
                || lower.contains("没有需要提高毛利的价格建议")
                || lower.contains("没有符合条件的酒款")
                || lower.contains("没有匹配的酒款")
                || lower.contains("no prices need")
                || lower.contains("no price suggestions")
                || lower.contains("no prices to review")
                || lower.contains("没有需要复核的价格")
                || lower.contains("no recommendation")
                || lower.contains("no grocery recommendations")
                || lower.contains("没有可推荐的商品")
                || lower.contains("没有符合条件的商品"));
        boolean chinese = isChinese(question);
        String title = cardTitle(type, chinese);
        String routeTarget = "product_count".equals(type) ? "/products"
                : "stock_history".equals(type) ? "/stock/list"
                : "guided_action".equals(type) ? route == null || route.isBlank() ? "/" : route
                : "/sommelier".equals(route) ? "/sommelier"
                : "/recommend/grocery".equals(route) ? "/recommend/grocery"
                : "/stock/capped-pricing".equals(route) ? "/stock/capped-pricing"
                : "/stock/replenishment";
        List<Map<String, Object>> items = unavailable || empty ? List.of() : cardItems(type, answer);
        String unavailableReason = unavailableReason(type, text, chinese);
        String source = "sommelier".equals(type) || "recommend".equals(type) ? "catalogue"
                : "guided_action".equals(type) ? "assistant" : "odoo";
        String ctaLabel = cardCtaLabel(type, routeTarget, chinese);
        String emptySummary = "product_count".equals(type)
                ? productCountSummary(text) : emptyReason(type, chinese);
        boolean retryable = unavailable && !"stock_history".equals(type) && !isNonRetryableFailure(text);
        return List.of(new AssistantCard(
                type,
                title,
                unavailable ? unavailableReason
                : empty ? emptySummary
                : "product_count".equals(type) ? productCountSummary(text) : cardSummary(answer, items),
                items,
                source,
                Instant.now().toString(),
                unavailable ? unavailableReason
                        : empty ? emptyReason(type, isChinese(question)) : null,
                unavailable ? "unavailable" : empty ? "empty" : "ready",
                ctaLabel,
                routeTarget,
                new AssistantCardCta(ctaLabel, routeTarget),
                retryable));
    }

    private static boolean isNonRetryableFailure(String answer) {
        String lower = answer == null ? "" : answer.toLowerCase(java.util.Locale.ROOT);
        return lower.contains("permission") || lower.contains("no access")
                || lower.contains("sign in") || lower.contains("not bound")
                || lower.contains("not connected") || lower.contains("not linked")
                || lower.contains("not configured") || lower.contains("尚未配置 odoo")
                || lower.contains("未配置 odoo")
                || answer != null && (answer.contains("没有权限") || answer.contains("无权限")
                || answer.contains("权限不足") || answer.contains("无法访问")
                || answer.contains("请先登录") || answer.contains("尚未绑定")
                || answer.contains("未绑定门店") || answer.contains("尚未连接")
                || answer.contains("未连接 Odoo") || answer.contains("尚未配置 Odoo")
                || answer.contains("未配置 Odoo"));
    }

    public static List<AssistantCard> cardsForHistory(String intent, String answer, String question) {
        UiAction ui;
        if ("stock_history_unavailable".equals(intent)) {
            ui = new UiAction("stock", "stock", "/stock/list", "navigate");
            return cardsFor(intent, ui, answer, question, "historical_stock_unavailable");
        } else if ("product_count".equals(intent)) {
            ui = new UiAction("products", "products", "/products", "navigate");
        } else if ("guided_action".equals(intent)) {
            String route = com.orithos.modules.ai.node.ClassifyQueryNode
                    .resolveGuidedActionRoute(question, null, null);
            ui = new UiAction(null, null, route, "guided_action");
        } else if ("navigate".equals(intent)) {
            WorkflowRouteRouter.Override workflow = WorkflowRouteRouter.maybeOverride(question);
            if (workflow == null) return List.of();
            ui = new UiAction(null, null, workflow.route(), "navigate");
        } else {
            return List.of();
        }
        return cardsFor(intent, ui, answer, question);
    }

    private static String unavailableReason(String type, String answer, boolean chinese) {
        // Keep the full historical-stock refusal, including the stock-page CTA sentence.
        // unavailableText() strips trailing "Open …" navigation prompts meant for other cards.
        if ("stock_history".equals(type)) {
            return answer == null ? "" : answer.trim();
        }
        String text = unavailableText(answer);
        if (!chinese) {
            return text.isBlank() ? "Live data is unavailable"
                    : "product_count".equals(type) ? productCountSummary(text) : text;
        }
        String lower = text.toLowerCase(java.util.Locale.ROOT);
        if (lower.contains("permission") || lower.contains("no access")
                || text.contains("没有权限") || text.contains("无权限")
                || text.contains("权限不足") || text.contains("无法访问")) {
            return "当前账号没有权限查询此数据，请联系管理员或检查门店权限。";
        }
        if (lower.contains("not configured") || lower.contains("尚未配置 odoo")
                || lower.contains("未配置 odoo")) {
            return "当前门店尚未配置 Odoo，请联系管理员完成配置。";
        }
        if (lower.contains("sign in") || lower.contains("not bound")
                || text.contains("请先登录") || text.contains("尚未绑定") || text.contains("未绑定门店")) {
            return "请先登录并确认账号已绑定门店，然后重试。";
        }
        if (text.isBlank() || lower.contains("unavailable") || lower.contains("not available")
                || text.contains("不可用") || text.contains("无法取得") || text.contains("无法获取")
                || text.contains("暂时无法") || text.contains("无法查询")) {
            return switch (type) {
                case "product_count" -> "暂时无法获取实时商品总数，请稍后重试。";
                case "sommelier" -> "品鉴推荐暂不可用，请稍后重试。";
                case "recommend" -> "商品推荐暂不可用，请稍后重试。";
                case "pricing" -> "价格复核建议暂不可用，请稍后重试。";
                default -> "补货建议暂不可用，请稍后重试。";
            };
        }
        return text;
    }

    private static String unavailableText(String answer) {
        if (answer == null || answer.isBlank()) return "";
        String firstLine = answer.lines().map(String::trim).filter(line -> !line.isBlank())
                .findFirst().orElse("");
        return firstLine.replaceFirst(
                "(?i)\\s*(?:retry(?:\\s+or)?\\s+)?(?:tap below to\\s+)?open\\s+.+?(?:to retry|to browse(?: the catalogue)?)?[.!。！]*\\s*$",
                "").trim();
    }

    private static String cardTitle(String type, boolean chinese) {
        if (chinese) {
            return switch (type) {
                case "product_count" -> "商品目录";
                case "stock_history" -> "历史库存";
                case "guided_action" -> "操作指引";
                case "sommelier" -> "品鉴推荐";
                case "recommend" -> "商品推荐";
                case "pricing" -> "价格复核建议";
                default -> "补货建议";
            };
        }
        return switch (type) {
            case "product_count" -> "Product catalogue";
            case "stock_history" -> "Historical stock";
            case "guided_action" -> "Action guide";
            case "sommelier" -> "Wine recommendations";
            case "recommend" -> "Grocery recommendations";
            case "pricing" -> "Price review suggestions";
            default -> "Replenishment suggestions";
        };
    }

    private static String cardCtaLabel(String type, String route, boolean chinese) {
        if ("guided_action".equals(type)) return guidedCtaLabel(route, chinese);
        if ("stock_history".equals(type)) return chinese ? "打开库存列表" : "Open stock list";
        if (chinese) {
            return switch (type) {
                case "product_count" -> "打开商品目录";
                case "pricing" -> "打开价格复核";
                case "sommelier" -> "打开品鉴推荐";
                case "recommend" -> "打开商品推荐";
                default -> "打开补货建议";
            };
        }
        return "product_count".equals(type) ? "Open products"
                : "pricing".equals(type) ? "Open price review"
                : "sommelier".equals(type) ? "Open Sommelier"
                : "recommend".equals(type) ? "Open grocery recommendations" : "Open replenishment";
    }

    private static String guidedCtaLabel(String route, boolean chinese) {
        if (chinese) {
            return switch (route == null ? "" : route) {
                case "/customers" -> "打开客户页面";
                case "/customers/balances" -> "打开客户余额";
                case "/products" -> "打开商品目录";
                case "/orders" -> "打开采购订单";
                case "/classifications" -> "打开商品分类";
                case "/customer-groups" -> "打开客户分组";
                case "/pricelists" -> "打开价目表";
                case "/giftcards" -> "打开礼品卡";
                case "/stock/replenishment" -> "打开补货页面";
                case "/stock/capped-pricing" -> "打开价格复核";
                case "/stock/buying-periods" -> "打开采购周期";
                case "/stocktake" -> "打开库存盘点";
                case "/invoices", "/invoices/scan" -> "打开供应商发票";
                case "/invoices/new" -> "扫描供应商发票";
                case "/suppliers/odoo" -> "打开供应商";
                case "/" -> "打开工作区";
                default -> "打开业务页面";
            };
        }
        return switch (route == null ? "" : route) {
            case "/customers" -> "Open customers";
            case "/customers/balances" -> "Open customer balances";
            case "/products" -> "Open products";
            case "/orders" -> "Open orders";
            case "/classifications" -> "Open classifications";
            case "/customer-groups" -> "Open customer groups";
            case "/pricelists" -> "Open price lists";
            case "/giftcards" -> "Open gift cards";
            case "/stock/replenishment" -> "Open replenishment";
            case "/stock/capped-pricing" -> "Open price review";
            case "/stock/buying-periods" -> "Open buying periods";
            case "/stocktake" -> "Open stocktake";
            case "/invoices" -> "Open supplier invoices";
            case "/invoices/scan" -> "Open supplier invoices";
            case "/invoices/new" -> "Scan supplier invoice";
            case "/suppliers/odoo" -> "Open suppliers";
            case "/" -> "Open workspace";
            default -> "Open workflow";
        };
    }

    private static String emptyReason(String type, boolean chinese) {
        if (chinese) {
            return switch (type) {
                case "product_count" -> "当前商品目录中没有可售商品。";
                case "pricing" -> "当前没有需要复核的价格建议。";
                case "replenishment" -> "当前没有补货建议。";
                case "recommend" -> "目前没有符合条件的商品推荐。";
                default -> "目前没有符合条件的推荐。";
            };
        }
        return switch (type) {
            case "product_count" -> "No sellable products are currently available in the catalogue.";
            case "pricing" -> "No price suggestions need review right now.";
            case "replenishment" -> "No replenishment suggestions are available right now.";
            case "recommend" -> "No grocery recommendations match those preferences right now.";
            default -> "No matching recommendations.";
        };
    }

    private static boolean productCountIsZero(String answer) {
        return answer != null && (answer.matches(
                "(?is).*\\b(?:has|have|contains|there are|total is)\\s+0\\s+(?:sellable\\s+)?(?:products?|items?|skus?)\\b.*")
                || answer.matches("(?s).*(?:(?:产品|商品|SKU)(?:总数|数量)?|(?:商品)?目录(?:里)?)\\s*(?:是|为|共有|有)?\\s*0(?:个|件|种)?(?:可售)?(?:产品|商品|SKU)?[^0-9]*$"));
    }

    private static String productCountSummary(String answer) {
        if (answer == null) return "";
        return answer.replaceFirst(
                  "(?i)\\s*(?:open products to browse(?: the catalogue)?|打开商品(?:页|目录)查看(?:目录)?)[。.!！]*\\s*$",
                "").trim();
    }

    private static boolean isChinese(String text) {
        return text != null && text.matches("(?s).*[\\u3400-\\u9fff].*");
    }

    private static List<Map<String, Object>> cardItems(String type, String answer) {
        if (answer == null || answer.isBlank() || "product_count".equals(type)) return List.of();
        List<Map<String, Object>> items = new ArrayList<>();
        for (String line : answer.split("\\R")) {
            String trimmed = line.trim();
            String itemText = cardItemText(trimmed);
            if (itemText == null) continue;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("label", itemText.trim());
            items.add(item);
            if (items.size() == 3) break;
        }
        return items;
    }

    private static String cardSummary(String answer, List<Map<String, Object>> items) {
        if (answer == null) return "";
        if (items.isEmpty()) return answer;
        return answer.lines().map(String::trim).filter(line -> cardItemText(line) == null)
                .findFirst().orElse(answer);
    }

    private static String cardItemText(String line) {
        if (line == null || line.isBlank()) return null;
        String itemText = line.replaceFirst("^(?:[•*-]|\\d+[.)])\\s*", "");
        return itemText.equals(line) || itemText.isBlank() ? null : itemText.trim();
    }

    private static String emptyToNull(String v) {
        return v == null || v.isBlank() ? null : v;
    }

    public record AssistantResult(
            String threadId,
            String intent,
            String intentSummary,
            String answer,
            Map<String, String> slots,
            UiAction ui,
            ReportTable table,
            Long reportId,
            List<AssistantCard> cards,
            List<String> writeRequests,
            String fastPathId,
            String source,
            boolean llmFallback,
            String dataAsOf,
            String dataSource,
            String storeScope
    ) {}
}
