package com.orithos.modules.ai.forecast;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.fasterxml.jackson.databind.JsonNode;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

@Component
public class ForecastClient {
    private static final Logger log = LoggerFactory.getLogger(ForecastClient.class);
    private final ObjectMapper mapper;
    private final HttpClient http;
    private final String baseUrl;
    private final Duration timeout;

    public ForecastClient(ObjectMapper mapper,
                          @Value("${app.ai.forecast.base-url:http://forecast-service:8000}") String baseUrl,
                          @Value("${app.ai.forecast.read-timeout-ms:10000}") long timeoutMs) {
        this.mapper = mapper;
        this.baseUrl = baseUrl == null ? "" : baseUrl.trim().replaceAll("/+$", "");
        this.timeout = Duration.ofMillis(Math.max(500, timeoutMs));
        this.http = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(2))
                .build();
    }

    public ForecastDtos.Response forecast(ForecastDtos.Request request) {
        if (baseUrl.isBlank()) throw new BusinessException(50331, "Forecast service is not configured.");
        try {
            String body = mapper.writeValueAsString(request);
            byte[] bodyBytes = body.getBytes(StandardCharsets.UTF_8);
            HttpRequest httpRequest = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/v1/forecast/sales"))
                    .timeout(timeout)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(bodyBytes))
                    .build();
            HttpResponse<String> response = http.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                if (response.statusCode() == 422) {
                    log.warn("Forecast service rejected request payloadBytes={} validationErrors={}",
                            bodyBytes.length, validationErrorPaths(response.body()));
                }
                throw new BusinessException(50331, "Forecast service returned an error.");
            }
            return mapper.readValue(response.body(), ForecastDtos.Response.class);
        } catch (BusinessException error) {
            throw error;
        } catch (Exception error) {
            throw new BusinessException(50331, "Forecast service is temporarily unavailable.");
        }
    }

    private String validationErrorPaths(String body) {
        try {
            JsonNode detail = mapper.readTree(body).path("detail");
            if (!detail.isArray()) return "details unavailable";
            java.util.List<String> errors = new java.util.ArrayList<>();
            for (JsonNode error : detail) {
                String location = java.util.stream.StreamSupport.stream(
                                error.path("loc").spliterator(), false)
                        .map(JsonNode::asText)
                        .collect(java.util.stream.Collectors.joining("."));
                String type = error.path("type").asText("unknown");
                errors.add(location + ":" + type);
                if (errors.size() == 12) break;
            }
            return errors.isEmpty() ? "details unavailable" : String.join(",", errors);
        } catch (Exception ignored) {
            return "details unavailable";
        }
    }
}
