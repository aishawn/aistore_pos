package com.orithos.modules.ai.config;

import com.alibaba.cloud.ai.autoconfigure.dashscope.DashScopeAsyncToolCallingManagerAutoConfiguration;
import com.alibaba.cloud.ai.autoconfigure.dashscope.DashScopeChatAutoConfiguration;
import com.alibaba.cloud.ai.graph.CompiledGraph;
import com.alibaba.cloud.ai.graph.KeyStrategy;
import com.alibaba.cloud.ai.graph.KeyStrategyFactory;
import com.alibaba.cloud.ai.graph.StateGraph;
import com.alibaba.cloud.ai.graph.exception.GraphStateException;
import com.alibaba.cloud.ai.graph.state.strategy.ReplaceStrategy;
import com.orithos.modules.ai.AiProperties;
import com.orithos.modules.ai.configstore.IntentConfigService;
import com.orithos.modules.ai.configstore.IntentSanitizeService;
import com.orithos.modules.ai.node.ClassifyQueryNode;
import com.orithos.modules.ai.node.GenerateResponseNode;
import com.orithos.modules.ai.report.AiReportQuotaService;
import com.orithos.modules.ai.report.AiReportProperties;
import com.orithos.modules.ai.report.BindTemplateSqlNode;
import com.orithos.modules.ai.report.FillReportSlotsNode;
import com.orithos.modules.ai.report.Nl2SqlGenerateNode;
import com.orithos.modules.ai.report.ReportRespondNode;
import com.orithos.modules.ai.report.ReportTemplateRegistry;
import com.orithos.modules.ai.report.SqlExecNode;
import com.orithos.modules.ai.report.SqlGuardNode;
import com.orithos.modules.ai.report.SqlTenantBinder;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
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
    private static final String BIND_SQL = "bind_template_sql";
    private static final String NL2SQL = "nl2sql";
    private static final String SQL_GUARD = "sql_guard";
    private static final String SQL_EXEC = "sql_exec";
    private static final String REPORT_RESPOND = "report_respond";
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
            FillReportSlotsNode fillReportSlotsNode,
            BindTemplateSqlNode bindTemplateSqlNode,
            SqlGuardNode sqlGuardNode,
            SqlExecNode sqlExecNode,
            ReportRespondNode reportRespondNode,
            AiReportProperties reportProperties,
            AiReportQuotaService quotaService) throws GraphStateException {

        var classify = node_async(new ClassifyQueryNode(
                posAssistantChatClient, intentConfigService, intentSanitizeService));
        var respond = node_async(new GenerateResponseNode(posAssistantChatClient, intentConfigService));
        var nl2sql = node_async(new Nl2SqlGenerateNode(
                posAssistantChatClient, intentConfigService,
                new SqlTenantBinder(reportProperties.getMaxRows()),
                quotaService));

        return new StateGraph(properties.graphName(), posAssistantKeyStrategyFactory)
                .addNode(CLASSIFY, classify)
                .addNode(RESPOND, respond)
                .addNode(FILL_SLOTS, node_async(fillReportSlotsNode))
                .addNode(BIND_SQL, node_async(bindTemplateSqlNode))
                .addNode(NL2SQL, nl2sql)
                .addNode(SQL_GUARD, node_async(sqlGuardNode))
                .addNode(SQL_EXEC, node_async(sqlExecNode))
                .addNode(REPORT_RESPOND, node_async(reportRespondNode))
                .addEdge(START, CLASSIFY)
                .addConditionalEdges(CLASSIFY, edge_async(state -> {
                    String intent = state.value("intent", String.class).orElse("unknown");
                    boolean report = ReportTemplateRegistry.TEMPLATE_INTENTS.contains(intent)
                            || REPORT_ADHOC.equals(intent);
                    return report ? "report" : "chat";
                }), Map.of("report", FILL_SLOTS, "chat", RESPOND))
                .addConditionalEdges(FILL_SLOTS, edge_async(state -> {
                    if (reportProperties.isForceNl2sql()) {
                        return "nl2sql";
                    }
                    String intent = state.value("intent", String.class).orElse("");
                    return REPORT_ADHOC.equals(intent) ? "nl2sql" : "template";
                }), Map.of("nl2sql", NL2SQL, "template", BIND_SQL))
                .addEdge(BIND_SQL, SQL_GUARD)
                .addEdge(NL2SQL, SQL_GUARD)
                .addEdge(SQL_GUARD, SQL_EXEC)
                .addEdge(SQL_EXEC, REPORT_RESPOND)
                .addEdge(REPORT_RESPOND, END)
                .addEdge(RESPOND, END);
    }

    @Bean
    CompiledGraph posAssistantGraph(StateGraph posAssistantStateGraph) throws GraphStateException {
        return posAssistantStateGraph.compile();
    }
}
