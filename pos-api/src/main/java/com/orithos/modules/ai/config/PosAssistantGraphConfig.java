package com.orithos.modules.ai.config;

import com.alibaba.cloud.ai.autoconfigure.dashscope.DashScopeAsyncToolCallingManagerAutoConfiguration;
import com.alibaba.cloud.ai.autoconfigure.dashscope.DashScopeChatAutoConfiguration;
import com.alibaba.cloud.ai.graph.CompileConfig;
import com.alibaba.cloud.ai.graph.CompiledGraph;
import com.alibaba.cloud.ai.graph.KeyStrategy;
import com.alibaba.cloud.ai.graph.KeyStrategyFactory;
import com.alibaba.cloud.ai.graph.StateGraph;
import com.alibaba.cloud.ai.graph.checkpoint.config.SaverConfig;
import com.alibaba.cloud.ai.graph.checkpoint.savers.MemorySaver;
import com.alibaba.cloud.ai.graph.exception.GraphStateException;
import com.alibaba.cloud.ai.graph.state.strategy.ReplaceStrategy;
import com.alibaba.cloud.ai.graph.action.NodeAction;
import com.orithos.config.CorrelationIdContext;
import com.orithos.modules.ai.AiProperties;
import com.orithos.modules.ai.PosAssistantTools;
import com.orithos.modules.ai.configstore.IntentConfigService;
import com.orithos.modules.ai.configstore.IntentSanitizeService;
import com.orithos.modules.ai.node.ClassifyQueryNode;
import com.orithos.modules.ai.node.GenerateResponseNode;
import com.orithos.modules.ai.report.FillReportSlotsNode;
import com.orithos.modules.ai.report.OdooReportQueryNode;
import com.orithos.modules.ai.report.OdooReportQueryService;
import com.orithos.modules.ai.report.ReportRespondNode;
import com.orithos.modules.ai.report.ReportTemplateRegistry;
import com.orithos.modules.ai.sommelier.SommelierChatBrief;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

import java.util.HashMap;
import java.util.Map;

import static com.alibaba.cloud.ai.graph.StateGraph.END;
import static com.alibaba.cloud.ai.graph.StateGraph.START;
import static com.alibaba.cloud.ai.graph.action.AsyncEdgeAction.edge_async;
import static com.alibaba.cloud.ai.graph.action.AsyncNodeAction.node_async;

@Configuration
@ConditionalOnProperty(name = "app.ai.enabled", havingValue = "true")
// Must use @Import (not @ImportAutoConfiguration): spring.autoconfigure.exclude also
// blocks ImportAutoConfiguration, so ChatModel would never register.
@Import({
        DashScopeChatAutoConfiguration.class,
        DashScopeAsyncToolCallingManagerAutoConfiguration.class
})
@EnableConfigurationProperties(AiProperties.class)
public class PosAssistantGraphConfig {

    private static final String CLASSIFY = "classify";
    private static final String RESPOND = "respond";
    private static final String FILL_SLOTS = "fill_slots";
    private static final String REPORT_RESPOND = "report_respond";
    private static final String ODOO_REPORT = "odoo_report";
    private static final String REPORT_ADHOC = "report_adhoc";

    @Bean
    ChatClient posAssistantChatClient(ChatModel chatModel) {
        return ChatClient.builder(chatModel).build();
    }

    @Bean
    KeyStrategyFactory posAssistantKeyStrategyFactory() {
        return () -> {
            HashMap<String, KeyStrategy> strategies = new HashMap<>();
            strategies.put("question", new ReplaceStrategy());
            strategies.put("conversation_history", new ReplaceStrategy());
            strategies.put("store_context", new ReplaceStrategy());
            strategies.put("last_intent", new ReplaceStrategy());
            strategies.put("last_slots", new ReplaceStrategy());
            strategies.put("ui_surface", new ReplaceStrategy());
            strategies.put(CorrelationIdContext.STATE_KEY, new ReplaceStrategy());
            strategies.put("intent", new ReplaceStrategy());
            strategies.put("intent_summary", new ReplaceStrategy());
            strategies.put("slots", new ReplaceStrategy());
            strategies.put("ui_panel", new ReplaceStrategy());
            strategies.put("ui_view", new ReplaceStrategy());
            strategies.put("ui_route", new ReplaceStrategy());
            strategies.put("ui_action", new ReplaceStrategy());
            strategies.put("answer", new ReplaceStrategy());
            strategies.put("vendor_id", new ReplaceStrategy());
            strategies.put("user_id", new ReplaceStrategy());
            strategies.put("outlet_id", new ReplaceStrategy());
            strategies.put("outlet_ids", new ReplaceStrategy());
            strategies.put("can_report_query", new ReplaceStrategy());
            strategies.put("can_report_cost", new ReplaceStrategy());
            strategies.put("sql", new ReplaceStrategy());
            strategies.put("sql_raw", new ReplaceStrategy());
            strategies.put("sql_path", new ReplaceStrategy());
            strategies.put("sql_params", new ReplaceStrategy());
            strategies.put("sql_error", new ReplaceStrategy());
            strategies.put("report_rows", new ReplaceStrategy());
            strategies.put("report_columns", new ReplaceStrategy());
            strategies.put("report_from", new ReplaceStrategy());
            strategies.put("report_to", new ReplaceStrategy());
            strategies.put("report_t0", new ReplaceStrategy());
            return strategies;
        };
    }

    @Bean
    StateGraph posAssistantStateGraph(
            AiProperties properties,
            KeyStrategyFactory posAssistantKeyStrategyFactory,
            ChatClient posAssistantChatClient,
            IntentConfigService intentConfigService,
            IntentSanitizeService intentSanitizeService,
            PosAssistantTools posAssistantTools,
            FillReportSlotsNode fillReportSlotsNode,
            OdooReportQueryNode odooReportQueryNode,
            ReportRespondNode reportRespondNode,
            OdooReportQueryService odooReportQueryService,
            ObjectProvider<SommelierChatBrief> sommelierChatBriefProvider) throws GraphStateException {

        var classify = node_async(withCorrelationContext(new ClassifyQueryNode(
                posAssistantChatClient, intentConfigService, intentSanitizeService, properties,
                odooReportQueryService, sommelierChatBriefProvider)));
        var respond = node_async(withCorrelationContext(new GenerateResponseNode(
                posAssistantChatClient, intentConfigService, properties, posAssistantTools)));
        return new StateGraph(properties.graphName(), posAssistantKeyStrategyFactory)
                .addNode(CLASSIFY, classify)
                .addNode(RESPOND, respond)
                .addNode(FILL_SLOTS, node_async(withCorrelationContext(fillReportSlotsNode)))
                .addNode(REPORT_RESPOND, node_async(withCorrelationContext(reportRespondNode)))
                .addNode(ODOO_REPORT, node_async(withCorrelationContext(odooReportQueryNode)))
                .addEdge(START, CLASSIFY)
                .addConditionalEdges(CLASSIFY, edge_async(state -> {
                    String intent = state.value("intent", String.class).orElse("unknown");
                    boolean report = ReportTemplateRegistry.TEMPLATE_INTENTS.contains(intent)
                            || REPORT_ADHOC.equals(intent);
                    return report ? "report" : "chat";
                }), Map.of("report", FILL_SLOTS, "chat", RESPOND))
                .addEdge(FILL_SLOTS, ODOO_REPORT)
                .addEdge(ODOO_REPORT, REPORT_RESPOND)
                .addEdge(REPORT_RESPOND, END)
                .addEdge(RESPOND, END);
    }

    private static NodeAction withCorrelationContext(NodeAction action) {
        return state -> CorrelationIdContext.with(
                state.value(CorrelationIdContext.STATE_KEY, String.class).orElse(null),
                () -> action.apply(state));
    }

    @Bean
    CompiledGraph posAssistantGraph(StateGraph posAssistantStateGraph) throws GraphStateException {
        // In-process checkpointer for thread continuity; multi-turn Q&A text lives in Redis
        // via AiConversationMemory (Lettuce). Official RedisSaver needs Redisson.
        CompileConfig compileConfig = CompileConfig.builder()
                .saverConfig(SaverConfig.builder().register(new MemorySaver()).build())
                .build();
        return posAssistantStateGraph.compile(compileConfig);
    }
}
