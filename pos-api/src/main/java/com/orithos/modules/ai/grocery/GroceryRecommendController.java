package com.orithos.modules.ai.grocery;

import com.orithos.common.ApiResult;
import com.orithos.modules.ai.report.TenantContextFactory;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai/recommend/grocery")
public class GroceryRecommendController {

    private final GroceryRecommendService service;
    private final TenantContextFactory tenantContextFactory;

    public GroceryRecommendController(GroceryRecommendService service, TenantContextFactory tenantContextFactory) {
        this.service = service;
        this.tenantContextFactory = tenantContextFactory;
    }

    @PostMapping
    public ApiResult<GroceryRecommendResponse> recommend(@Valid @RequestBody GroceryRecommendRequest request) {
        return ApiResult.ok(service.recommend(request, tenantContextFactory.fromSecurity()));
    }
}
