package com.orithos.modules.ai;

import com.alibaba.cloud.ai.graph.CompiledGraph;
import com.alibaba.cloud.ai.graph.NodeOutput;
import com.alibaba.cloud.ai.graph.RunnableConfig;
import com.alibaba.cloud.ai.graph.state.StateSnapshot;
import com.orithos.config.CorrelationIdContext;
import com.orithos.modules.ai.context.FollowUpSupport;
import com.orithos.modules.ai.context.StoreContextPack;
import com.orithos.modules.ai.context.StoreContextPackAssembler;
import com.orithos.modules.ai.dto.ReportTable;
import com.orithos.modules.ai.dto.UiAction;
import com.orithos.modules.ai.report.AiReportSnapshotService;
import com.orithos.modules.ai.report.ReportJsonCells;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

import java.time.Duration;
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
            Long reportId = snapshotService.save(tenant, intent, question, answer, table, slots);

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
                    reportId
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

    private static String resolveThreadId(String threadId, TenantContext tenant) {
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
            Long reportId
    ) {}
}
