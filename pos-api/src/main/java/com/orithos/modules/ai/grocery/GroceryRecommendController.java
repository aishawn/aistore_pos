package com.orithos.modules.ai.grocery;

import com.orithos.common.ApiResult;
import com.orithos.modules.ai.AiProviderQuotaService;
import com.orithos.modules.ai.report.TenantContextFactory;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.beans.factory.annotation.Autowired;

@RestController
@RequestMapping("/api/ai/recommend/grocery")
public class GroceryRecommendController {

    private final GroceryRecommendService service;
    private final TenantContextFactory tenantContextFactory;
    private final AiProviderQuotaService providerQuota;

    @Autowired
    public GroceryRecommendController(GroceryRecommendService service, TenantContextFactory tenantContextFactory,
                                      AiProviderQuotaService providerQuota) {
        this.service = service;
        this.tenantContextFactory = tenantContextFactory;
        this.providerQuota = providerQuota;
    }

    @PostMapping
    public ApiResult<GroceryRecommendResponse> recommend(@Valid @RequestBody GroceryRecommendRequest request) {
        var tenant = tenantContextFactory.fromSecurity();
        providerQuota.acquire(tenant, AiProviderQuotaService.estimate(String.valueOf(request)));
        return ApiResult.ok(service.recommend(request, tenant));
    }
}
