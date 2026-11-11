package com.orithos.modules.ai.decision;

import com.orithos.common.BusinessException;
import com.orithos.modules.ai.pricing.NativePriceSuggestionService;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.replenishment.NativeReplenishmentService;
import com.orithos.modules.ai.forecast.ForecastDtos;
import com.orithos.modules.ai.forecast.ForecastService;
import com.orithos.security.PermissionAccess;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class AiDecisionService {
    private final NativePriceSuggestionService pricing;
    private final NativeReplenishmentService replenishment;
    private final AiDecisionRepository repository;
    private final PermissionAccess permissions;
    private final ForecastService forecast;

    @Autowired
    public AiDecisionService(NativePriceSuggestionService pricing, NativeReplenishmentService replenishment,
                             AiDecisionRepository repository, PermissionAccess permissions,
                             ForecastService forecast) {
        this.pricing = pricing; this.replenishment = replenishment;
        this.repository = repository; this.permissions = permissions; this.forecast = forecast;
    }

    AiDecisionService(NativePriceSuggestionService pricing, NativeReplenishmentService replenishment,
                      AiDecisionRepository repository, PermissionAccess permissions) {
        this(pricing, replenishment, repository, permissions, null);
    }

    public Map<String, Object> previewPricing(TenantContext tenant) {
        permissions.requirePermission("ai.price_suggestions");
        var result = pricing.review(tenant);
        if (result == null) throw new BusinessException(50320, "Pricing source data is unavailable");
        Instant at = Instant.now();
        Map<String, Object> engine = Map.of("status", "NATIVE_LEDGER", "version", "margin-review-v1");
        UUID id = insert(tenant, "PRICING", at, "margin-review-v1", Map.of("result", result));
        return Map.of("snapshotId", id, "type", "PRICING", "status", "PREVIEW", "dataAsOf", at, "result", result, "engine", engine);
    }

    public Map<String, Object> previewReplenishment(TenantContext tenant) {
        permissions.requirePermission("stock.replenishment");
        var result = replenishment.plan(tenant);
        if (result == null) throw new BusinessException(50320, "Replenishment source data is unavailable");
        Instant at = Instant.now();
        Map<String, Object> engine = Map.of("status", "NATIVE_LEDGER", "version", "weighted-velocity-v1");
        Map<String, Object> forecastResult = forecastPreview(tenant);
        UUID id = insert(tenant, "REPLENISHMENT", at, "weighted-velocity-v1",
                Map.of("result", result, "engine", engine));
        return Map.of("snapshotId", id, "type", "REPLENISHMENT", "status", "PREVIEW", "dataAsOf", at,
                "result", result, "engine", engine, "forecast", forecastResult);
    }

    private Map<String, Object> forecastPreview(TenantContext tenant) {
        if (forecast == null) return Map.of("status", "NOT_CONFIGURED");
        try {
            ForecastDtos.Response response = forecast.forecast(tenant, 14);
            return Map.of("status", "AVAILABLE", "model", response.model(),
                    "modelVersion", response.modelVersion(), "sourceVersion", response.sourceVersion(),
                    "horizonDays", response.horizonDays(), "items", response.items());
        } catch (BusinessException error) {
            return Map.of("status", "UNAVAILABLE", "code", error.getCode(), "reason", error.getMessage());
        }
    }

    private UUID insert(TenantContext tenant, String type, Instant at, String config, Object result) {
        return repository.insert(tenant, type, at, config, "orithos-native", "live", Map.of("status", "CURRENT"), result);
    }

    public List<Map<String, Object>> list(TenantContext tenant, String type, int limit) {
        String normalized = type == null ? "PRICING" : type.trim().toUpperCase();
        if (!List.of("PRICING", "REPLENISHMENT").contains(normalized)) throw new BusinessException(40010, "Unsupported decision type");
        permissions.requirePermission(permissionFor(normalized));
        return repository.list(tenant, normalized, limit);
    }

    public void feedback(TenantContext tenant, UUID snapshotId, FeedbackRequest request) {
        String type = repository.decisionType(tenant, snapshotId);
        permissions.requirePermission(permissionFor(type.toUpperCase()));
        String action = request.action() == null ? "" : request.action().trim().toUpperCase();
        if (!List.of("ACCEPTED", "ADJUSTED", "REJECTED").contains(action)) throw new BusinessException(40010, "Unsupported feedback action");
        if (action.equals("ADJUSTED") && request.after() == null) throw new BusinessException(40010, "Adjusted decision value is required");
        repository.feedback(tenant, snapshotId, action, request.before(), request.after(), request.note());
    }

    public Map<String, Object> backtest(TenantContext tenant, String type,
                                        String baselineVersion, String candidateVersion) {
        permissions.requirePermission(permissionFor(type));
        throw new BusinessException(50320, "Historical replay is unavailable until Orithos-native decision history is built.");
    }

    private static String permissionFor(String type) {
        return "REPLENISHMENT".equalsIgnoreCase(type) ? "stock.replenishment" : "ai.price_suggestions";
    }

    public record FeedbackRequest(String action, Object before, Object after, String note) { }
}
