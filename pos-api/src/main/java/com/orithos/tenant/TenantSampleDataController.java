package com.orithos.tenant;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import com.orithos.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/tenant/sample-data")
public class TenantSampleDataController {
    private static final String CONFIRM_PHRASE = "REMOVE SAMPLE";

    private final VendorMapper vendorMapper;

    public TenantSampleDataController(VendorMapper vendorMapper) {
        this.vendorMapper = vendorMapper;
    }

    public record PurgeRequest(String confirmation) {}

    @GetMapping("/status")
    @PreAuthorize("isAuthenticated()")
    public ApiResult<Map<String, Object>> status() {
        Vendor vendor = vendorMapper.findById(resolveVendorId());
        if (vendor == null) throw new BusinessException(40410, "Store not found");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("dummyDataRequested", Boolean.TRUE.equals(vendor.getDummyDataRequested()));
        body.put("sampleDataClearedAt", vendor.getSampleDataClearedAt());
        body.put("state", vendor.getSampleDataClearedAt() == null ? "native_data_retained" : "cleared");
        body.put("demoProductCount", 0);
        body.put("demoCustomerCount", 0);
        body.put("demoOrderCount", 0);
        body.put("nonDemoPaidOrderCount", 0);
        body.put("canPurge", false);
        body.put("archiveOnly", true);
        body.put("confirmPhrase", CONFIRM_PHRASE);
        body.put("message", "Sample data cleanup is retired. Orithos ledger and imported store records are retained.");
        return ApiResult.ok(body);
    }

    @PostMapping("/purge")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> purge(@RequestBody(required = false) PurgeRequest request) {
        String confirmation = request == null || request.confirmation() == null ? "" : request.confirmation().trim();
        if (!CONFIRM_PHRASE.equalsIgnoreCase(confirmation)) {
            throw new BusinessException(40001, "Type REMOVE SAMPLE to confirm.");
        }
        throw new ResponseStatusException(HttpStatus.GONE,
                "Sample data cleanup is retired. Orithos ledger and imported store records were not changed.");
    }

    private static Long resolveVendorId() {
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) {
            TenantHolder.ResolvedTenant tenant = TenantHolder.get();
            if (tenant != null && tenant.vendor() != null) vendorId = tenant.vendor().getId();
        }
        if (vendorId == null) throw new BusinessException(40100, "Unauthorized");
        return vendorId;
    }
}
