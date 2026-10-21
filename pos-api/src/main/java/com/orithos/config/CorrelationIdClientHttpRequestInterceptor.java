package com.orithos.config;

import org.slf4j.MDC;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;

import java.io.IOException;
import java.util.regex.Pattern;

public class CorrelationIdClientHttpRequestInterceptor implements ClientHttpRequestInterceptor {

    private static final Pattern UUID_PATTERN = Pattern.compile(
            "(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution)
            throws IOException {
        String correlationId = MDC.get(RequestCorrelationFilter.MDC_KEY);
        if (correlationId != null && UUID_PATTERN.matcher(correlationId).matches()) {
            request.getHeaders().set(RequestCorrelationFilter.HEADER, correlationId);
        }
        return execution.execute(request, body);
    }
}
