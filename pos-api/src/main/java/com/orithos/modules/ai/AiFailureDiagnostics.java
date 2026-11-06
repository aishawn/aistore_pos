package com.orithos.modules.ai;

import com.orithos.config.RequestCorrelationFilter;
import org.slf4j.MDC;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/** Classifies exception types only; no prompts, URLs, keys or provider messages. */
final class AiFailureDiagnostics {
    private AiFailureDiagnostics() {}

    static String correlationId() {
        String id = MDC.get(RequestCorrelationFilter.MDC_KEY);
        if (id == null || !id.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) {
            id = UUID.randomUUID().toString();
        }
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes
                && attributes.getResponse() != null) {
            attributes.getResponse().setHeader("X-Correlation-ID", id);
        }
        return id;
    }

    static String category(Throwable error) {
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        String category = "workflow";
        for (Throwable current = error; current != null && seen.add(current); current = current.getCause()) {
            String type = current.getClass().getName().toLowerCase(Locale.ROOT);
            if (type.contains("timeout")) return "timeout";
            if (type.contains("sql") || type.contains("dataaccess") || type.contains("jdbc")) category = "data_access";
            else if ("workflow".equals(category) && (type.contains("configuration") || type.contains("beancreation"))) category = "configuration";
        else if ("workflow".equals(category) && (type.contains("webclient") || type.contains("httpclient") || type.contains("spring.ai"))) category = "provider";
        }
        return category;
    }
}
