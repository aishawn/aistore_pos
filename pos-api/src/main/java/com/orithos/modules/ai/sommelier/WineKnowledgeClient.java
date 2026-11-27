package com.orithos.modules.ai.sommelier;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Component
public class WineKnowledgeClient {
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};
    private final RestClient client;
    private final ObjectMapper objectMapper;
    private final String serviceToken;
    private final String tenantSecret;
    private final boolean enabled;

    public WineKnowledgeClient(RestClient.Builder builder, ObjectMapper objectMapper,
                               @Value("${AI_SERVICE_BASE_URL:https://ai.orithos.com.au}") String baseUrl,
                               @Value("${AI_SERVICE_TOKEN:}") String serviceToken,
                               @Value("${AI_WINE_TENANT_HMAC_SECRET:}") String tenantSecret,
                               @Value("${app.ai.wine-knowledge.enabled:${AI_WINE_KNOWLEDGE_ENABLED:false}}") boolean enabled) {
        this.objectMapper = objectMapper;
        this.serviceToken = serviceToken == null ? "" : serviceToken.trim();
        this.tenantSecret = tenantSecret == null ? "" : tenantSecret;
        this.enabled = enabled;
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build());
        factory.setReadTimeout(Duration.ofSeconds(8));
        this.client = builder.clone().baseUrl(baseUrl.replaceAll("/+$", ""))
                .requestFactory(factory).build();
    }

    public boolean enabled() { return enabled; }

    public Map<String, Object> recommend(TenantContext tenant, Map<String, Object> preferences,
                                         List<Map<String, Object>> candidates) {
        if (!enabled || candidates == null || candidates.isEmpty()) return null;
        Map<String, Object> body = Map.of("preferences", preferences, "candidates", candidates, "limit", 10);
        return request(tenant, Set.of("wine:recommend"), "/v1/wine/recommendations", body);
    }

    public Map<String, Object> listProfiles(TenantContext tenant, String status) {
        return requestGet(tenant, "/v1/wine/profiles?status=" + status + "&limit=100");
    }

    public Map<String, Object> submitProfile(TenantContext tenant, Map<String, Object> body) {
        return request(tenant, Set.of("wine:curate"), "/v1/wine/profiles", body);
    }

    public Map<String, Object> reviewProfile(TenantContext tenant, String profileId, Map<String, Object> body) {
        return request(tenant, Set.of("wine:curate"), "/v1/wine/profiles/" + profileId + "/review", body);
    }

    public void feedback(TenantContext tenant, long productId, String reaction) {
        if (!enabled) return;
        request(tenant, Set.of("wine:recommend"), "/v1/wine/feedback",
                Map.of("productId", productId, "reaction", reaction));
    }

    private Map<String, Object> requestGet(TenantContext tenant, String path) {
        String token = token(tenant, Set.of("wine:curate"));
        return client.get().uri(path).header("Authorization", "Bearer " + requireServiceToken())
                .header("X-Orithos-Tenant-Context", token).retrieve()
                .body(new ParameterizedTypeReference<>() {});
    }

    private Map<String, Object> request(TenantContext tenant, Set<String> scope, String path, Object body) {
        return client.post().uri(path).contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + requireServiceToken())
                .header("X-Orithos-Tenant-Context", token(tenant, scope)).body(body).retrieve()
                .body(new ParameterizedTypeReference<>() {});
    }

    private String token(TenantContext tenant, Set<String> scope) {
        try {
            return WineTenantContextToken.sign(tenant, scope, tenantSecret);
        } catch (IllegalArgumentException error) {
            throw new BusinessException(50301, "Wine knowledge service is not configured");
        }
    }

    private String requireServiceToken() {
        if (!StringUtils.hasText(serviceToken)) {
            throw new BusinessException(50301, "Wine knowledge service is not configured");
        }
        return serviceToken;
    }

    public Map<String, Object> asMap(Object value) {
        return objectMapper.convertValue(value, MAP);
    }
}
