package com.orithos.config;

import org.slf4j.MDC;

import java.util.concurrent.Callable;
import java.util.regex.Pattern;

public final class CorrelationIdContext {

    public static final String STATE_KEY = "correlation_id";
    private static final Pattern UUID_PATTERN = Pattern.compile(
            "(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");

    private CorrelationIdContext() {}

    public static String current() {
        String value = MDC.get(RequestCorrelationFilter.MDC_KEY);
        return value != null && UUID_PATTERN.matcher(value).matches() ? value : null;
    }

    public static <T> T with(String correlationId, Callable<T> action) throws Exception {
        String previous = MDC.get(RequestCorrelationFilter.MDC_KEY);
        if (correlationId != null && UUID_PATTERN.matcher(correlationId).matches()) {
            MDC.put(RequestCorrelationFilter.MDC_KEY, correlationId);
        } else {
            MDC.remove(RequestCorrelationFilter.MDC_KEY);
        }
        try {
            return action.call();
        } finally {
            if (previous == null) MDC.remove(RequestCorrelationFilter.MDC_KEY);
            else MDC.put(RequestCorrelationFilter.MDC_KEY, previous);
        }
    }
}
