package com.orithos.tenant;

import com.orithos.common.ApiResult;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/public")
public class PublicSignupController {

    private final TenantProvisionService provisionService;
    private final SignupRateLimiter rateLimiter;
    private final TenantProperties tenantProperties;
    private final OdooTenantProvisioner odooTenantProvisioner;

    public PublicSignupController(TenantProvisionService provisionService,
                                  SignupRateLimiter rateLimiter,
                                  TenantProperties tenantProperties,
                                  OdooTenantProvisioner odooTenantProvisioner) {
        this.provisionService = provisionService;
        this.rateLimiter = rateLimiter;
        this.tenantProperties = tenantProperties;
        this.odooTenantProvisioner = odooTenantProvisioner;
    }

    public record SignupRequest(
            @NotBlank String organisationName,
            @NotBlank String subdomain,
            @NotBlank String ownerName,
            @NotBlank String username,
            @NotBlank String email,
            @NotBlank String password,
            String phone,
            List<TenantProvisionService.OutletSpec> outlets,
            Boolean dummyData
    ) {}

    @GetMapping("/subdomain-available")
    public ApiResult<Map<String, Object>> subdomainAvailable(@RequestParam String slug,
                                                             HttpServletRequest request) {
        rateLimiter.checkAvailable(clientIp(request));
        boolean available = provisionService.isSubdomainAvailable(slug);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("slug", slug == null ? null : slug.trim().toLowerCase());
        body.put("available", available);
        body.put("baseDomain", tenantProperties.getBaseDomain());
        body.put("previewHost", available && slug != null
                ? slug.trim().toLowerCase() + "." + tenantProperties.getBaseDomain()
                : null);
        return ApiResult.ok(body);
    }

    @PostMapping("/signup")
    public ApiResult<Map<String, Object>> signup(@Valid @RequestBody SignupRequest req,
                                                 HttpServletRequest request) {
        rateLimiter.checkSignup(clientIp(request));
        TenantProvisionService.ProvisionResult result = provisionService.provision(
                new TenantProvisionService.ProvisionRequest(
                        req.organisationName(),
                        req.subdomain(),
                        req.ownerName(),
                        req.username(),
                        req.email(),
                        req.password(),
                        req.phone(),
                        null,
                        req.outlets(),
                        req.dummyData()));
        odooTenantProvisioner.provisionAsyncSafe(result.vendorId());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("vendorId", result.vendorId());
        body.put("subdomain", result.subdomain());
        body.put("redirectHost", result.redirectHost());
        body.put("bootstrapToken", result.bootstrapToken());
        body.put("outletId", result.outletId());
        body.put("userId", result.userId());
        return ApiResult.ok(body);
    }

    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
