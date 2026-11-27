package com.orithos.modules.ai.sommelier;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.report.TenantContextFactory;
import com.orithos.modules.ai.sommelier.dto.WineProfileProductOption;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/ai/sommelier/profiles")
@PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('perm:stock.products.edit')")
public class WineKnowledgeController {
    private static final Set<String> STATUSES = Set.of("PENDING", "APPROVED", "REJECTED", "REVOKED");
    private final WineKnowledgeClient client;
    private final SommelierCatalogService catalog;
    private final TenantContextFactory tenantFactory;

    public WineKnowledgeController(WineKnowledgeClient client, SommelierCatalogService catalog,
                                  TenantContextFactory tenantFactory) {
        this.client = client;
        this.catalog = catalog;
        this.tenantFactory = tenantFactory;
    }

    @GetMapping
    public ApiResult<Map<String, Object>> profiles(@RequestParam(defaultValue = "PENDING") String status) {
        if (!STATUSES.contains(status)) throw new BusinessException(40000, "Invalid wine profile status");
        return ApiResult.ok(client.listProfiles(tenantFactory.fromSecurity(), status));
    }

    @GetMapping("/products")
    public ApiResult<List<WineProfileProductOption>> products(@RequestParam String q) {
        TenantContext tenant = tenantFactory.fromSecurity();
        List<WineProfileProductOption> result = catalog.search(tenant, q).stream()
                .filter(wine -> wine.inStock())
                .filter(wine -> !WineLexicon.isKnownNonWine(wine.name(), wine.categoryName(), wine.familyName()))
                .limit(30)
                .map(wine -> new WineProfileProductOption(wine.productId(), wine.gtin(), wine.name(), wine.brandName()))
                .toList();
        return ApiResult.ok(result);
    }

    @PostMapping
    public ApiResult<Map<String, Object>> submit(@Valid @RequestBody Map<String, Object> payload) {
        return ApiResult.ok(client.submitProfile(tenantFactory.fromSecurity(), payload));
    }

    @PostMapping("/{profileId}/review")
    public ApiResult<Map<String, Object>> review(@PathVariable UUID profileId,
                                                  @Valid @RequestBody Map<String, Object> payload) {
        Object decision = payload.get("decision");
        if (!(decision instanceof String value) || !Set.of("APPROVE", "REJECT", "REVOKE").contains(value)) {
            throw new BusinessException(40000, "Invalid wine profile review decision");
        }
        return ApiResult.ok(client.reviewProfile(tenantFactory.fromSecurity(), profileId.toString(), payload));
    }
}
