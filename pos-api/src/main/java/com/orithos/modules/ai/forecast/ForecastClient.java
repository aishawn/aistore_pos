package com.orithos.modules.ai.forecast;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

@Component
public class ForecastClient {
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
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    }

    public ForecastDtos.Response forecast(ForecastDtos.Request request) {
        if (baseUrl.isBlank()) throw new BusinessException(50331, "Forecast service is not configured.");
        try {
            String body = mapper.writeValueAsString(request);
            HttpRequest httpRequest = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/v1/forecast/sales"))
                    .timeout(timeout)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = http.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new BusinessException(50331, "Forecast service returned an error.");
            }
            return mapper.readValue(response.body(), ForecastDtos.Response.class);
        } catch (BusinessException error) {
            throw error;
        } catch (Exception error) {
            throw new BusinessException(50331, "Forecast service is temporarily unavailable.");
        }
    }
}
