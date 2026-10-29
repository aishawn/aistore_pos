package com.orithos.modules.ai.gateway;

import com.orithos.config.CorrelationIdContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class AiGatewayUsageRecorder {
    private static final Logger log = LoggerFactory.getLogger(AiGatewayUsageRecorder.class);
    private final JdbcTemplate jdbc;

    public AiGatewayUsageRecorder(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void recordSuccess(AiTenantContext tenant, AiTask task, AiCompletion<?> completion) {
        boolean reported = completion.inputTokens() != null && completion.outputTokens() != null;
        try {
            jdbc.update("""
                    INSERT INTO ai_gateway_usage
                    (vendor_id, outlet_id, user_id, task, provider, model, input_tokens, output_tokens,
                     usage_reported, latency_ms, fallback, request_status, correlation_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUCCEEDED', ?)
                    """, tenant.vendorId(), tenant.outletId(), tenant.userId(), task.name(), completion.provider(),
                    completion.model(), completion.inputTokens(), completion.outputTokens(), reported,
                    completion.latency().toMillis(), completion.fallback(), CorrelationIdContext.current());
        } catch (RuntimeException failure) {
            log.warn("AI usage audit insert failed task={} correlationId={} type={}", task,
                    tenant.correlationId(), failure.getClass().getSimpleName());
        }
    }
}
