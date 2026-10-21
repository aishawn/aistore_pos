package com.orithos.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

public class RequestCorrelationFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Correlation-ID";
    public static final String MDC_KEY = "correlationId";
    public static final String STARTED_AT_ATTRIBUTE = RequestCorrelationFilter.class.getName() + ".startedAtNanos";
    private static final String UUID_PATTERN = "(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String correlationId = request.getHeader(HEADER);
        if (correlationId == null || !correlationId.matches(UUID_PATTERN)) {
            correlationId = UUID.randomUUID().toString();
        }
        response.setHeader(HEADER, correlationId);
        MDC.put(MDC_KEY, correlationId);
        request.setAttribute(STARTED_AT_ATTRIBUTE, System.nanoTime());
        try {
            filterChain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }
}
