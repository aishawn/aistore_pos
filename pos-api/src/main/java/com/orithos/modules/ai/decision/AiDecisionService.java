package com.orithos.modules.ai.decision;

import com.orithos.common.BusinessException;
import com.orithos.modules.ai.pricing.OdooPriceSuggestionClient;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.replenishment.OdooReplenishmentClient;
import com.orithos.modules.ai.snapshot.OdooReadSnapshotService;
import com.orithos.modules.ai.snapshot.OdooReadSnapshotSyncResult;
import com.orithos.modules.ai.snapshot.SnapshotDecisionEvaluator;
import com.orithos.security.PermissionAccess;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class AiDecisionService {
    private final OdooPriceSuggestionClient pricing;
    private final OdooReplenishmentClient replenishment;
    private final AiDecisionRepository repository;
    private final PermissionAccess permissions;
    private final OdooReadSnapshotService snapshots;
    private final SnapshotDecisionEvaluator evaluator;

    @Autowired
    public AiDecisionService(OdooPriceSuggestionClient pricing, OdooReplenishmentClient replenishment,
                             AiDecisionRepository repository, PermissionAccess permissions,
                             OdooReadSnapshotService snapshots, SnapshotDecisionEvaluator evaluator) {
        this.pricing = pricing; this.replenishment = replenishment;
        this.repository = repository; this.permissions = permissions; this.snapshots = snapshots; this.evaluator = evaluator;
    }

    /** Compatibility constructor for narrow unit tests that do not exercise the Odoo snapshot boundary. */
    AiDecisionService(OdooPriceSuggestionClient pricing, OdooReplenishmentClient replenishment,
                      AiDecisionRepository repository, PermissionAccess permissions) {
        this(pricing, replenishment, repository, permissions, null, null);
    }

    public Map<String, Object> previewPricing(TenantContext tenant) {
        permissions.requirePermission("ai.price_suggestions");
        OdooReadSnapshotSyncResult source = syncSnapshot(tenant);
        var result = pricing.review(tenant);
        if (result == null) throw new BusinessException(50320, "Pricing source data is unavailable");
        Instant at = Instant.now();
        Map<String, Object> engine = evaluatePricing(tenant, source);
        UUID id = insert(tenant, "PRICING", at, "rule-v1", source, Map.of("liveResult", result, "engine", engine));
        return Map.of("snapshotId", id, "type", "PRICING", "status", "PREVIEW", "dataAsOf", at, "result", result, "engine", engine);
    }

    public Map<String, Object> previewReplenishment(TenantContext tenant) {
        permissions.requirePermission("stock.replenishment");
        OdooReadSnapshotSyncResult source = syncSnapshot(tenant);
        var result = replenishment.plan(tenant);
        if (result == null) throw new BusinessException(50320, "Replenishment source data is unavailable");
        Instant at = Instant.now();
        Map<String, Object> engine = evaluateReplenishment(tenant, source);
        UUID id = insert(tenant, "REPLENISHMENT", at, "weighted-velocity-v1", source, Map.of("liveResult", result, "engine", engine));
        return Map.of("snapshotId", id, "type", "REPLENISHMENT", "status", "PREVIEW", "dataAsOf", at, "result", result, "engine", engine);
    }

    private OdooReadSnapshotSyncResult syncSnapshot(TenantContext tenant) {
        return snapshots == null ? null : snapshots.sync(tenant, 56);
    }

    private Map<String, Object> evaluatePricing(TenantContext tenant, OdooReadSnapshotSyncResult source) {
        return evaluator == null || source == null ? Map.of("status", "NOT_AVAILABLE")
                : evaluator.evaluatePricing(tenant, source.sourceVersion());
    }

    private Map<String, Object> evaluateReplenishment(TenantContext tenant, OdooReadSnapshotSyncResult source) {
        return evaluator == null || source == null ? Map.of("status", "NOT_AVAILABLE")
                : evaluator.evaluateReplenishment(tenant, source.sourceVersion());
    }

    private UUID insert(TenantContext tenant, String type, Instant at, String config,
                        OdooReadSnapshotSyncResult source, Object result) {
        if (source == null) return repository.insert(tenant, type, at, config, result);
        return repository.insert(tenant, type, source.dataAsOf(), config, "odoo-snapshot",
                source.sourceVersion(), source.dataQuality(), result);
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

    private static String permissionFor(String type) {
        return "REPLENISHMENT".equalsIgnoreCase(type) ? "stock.replenishment" : "ai.price_suggestions";
    }

    public record FeedbackRequest(String action, Object before, Object after, String note) { }
}
