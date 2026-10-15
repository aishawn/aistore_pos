package com.orithos.tenant;

import com.orithos.common.ApiResult;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/tenants")
public class AdminTenantController {

    private final TenantProvisionService provisionService;

    public AdminTenantController(TenantProvisionService provisionService) {
        this.provisionService = provisionService;
    }

    public record AdminProvisionRequest(
            @NotBlank String organisationName,
            @NotBlank String subdomain,
            @NotBlank String ownerName,
            @NotBlank String username,
            @NotBlank String email,
            @NotBlank String password,
            String phone,
            Integer trialDays
    ) {}

    @PostMapping
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> create(@Valid @RequestBody AdminProvisionRequest req) {
        TenantProvisionService.ProvisionResult result = provisionService.provision(
                new TenantProvisionService.ProvisionRequest(
                        req.organisationName(),
                        req.subdomain(),
                        req.ownerName(),
                        req.username(),
                        req.email(),
                        req.password(),
                        req.phone(),
                        req.trialDays()));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("vendorId", result.vendorId());
        body.put("subdomain", result.subdomain());
        body.put("redirectHost", result.redirectHost());
        body.put("bootstrapToken", result.bootstrapToken());
        body.put("outletId", result.outletId());
        body.put("userId", result.userId());
        return ApiResult.ok(body);
    }
}
