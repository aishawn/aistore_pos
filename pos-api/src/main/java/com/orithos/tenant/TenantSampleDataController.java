package com.orithos.tenant;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.security.CurrentUser;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/tenant/sample-data")
public class TenantSampleDataController {

    private static final String CONFIRM_PHRASE = "REMOVE SAMPLE";

    private final OdooTenantProvisioner odooTenantProvisioner;

    public TenantSampleDataController(OdooTenantProvisioner odooTenantProvisioner) {
        this.odooTenantProvisioner = odooTenantProvisioner;
    }

    public record PurgeRequest(String confirmation) {}

    @GetMapping("/status")
    @PreAuthorize("isAuthenticated()")
    public ApiResult<Map<String, Object>> status() {
        Long vendorId = resolveVendorId();
        try {
            OdooTenantProvisioner.SampleDataStatus status = odooTenantProvisioner.sampleDataStatus(vendorId);
            return ApiResult.ok(toStatusBody(status));
        } catch (IllegalArgumentException e) {
            throw new BusinessException(40410, "Store not found");
        }
    }

    @PostMapping("/purge")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> purge(@RequestBody(required = false) PurgeRequest req) {
        String confirmation = req == null || req.confirmation() == null ? "" : req.confirmation().trim();
        if (!CONFIRM_PHRASE.equalsIgnoreCase(confirmation)) {
            throw new BusinessException(40001, "Type REMOVE SAMPLE to confirm removing sample data.");
        }
        Long vendorId = resolveVendorId();
        try {
            OdooTenantProvisioner.SampleDataStatus before = odooTenantProvisioner.sampleDataStatus(vendorId);
            if (!before.canPurge() && "cleared".equals(before.state())) {
                Map<String, Object> body = toPurgeBody(new OdooTenantProvisioner.SampleDataPurgeResult(
                        "cleared",
                        before.archiveOnly(),
                        0,
                        0,
                        0,
                        before.demoOrderCount(),
                        before.sampleDataClearedAt()));
                body.put("idempotent", true);
                return ApiResult.ok(body);
            }
            if (!before.canPurge()) {
                throw new BusinessException(40910, "This store has no sample data to remove.");
            }
            OdooTenantProvisioner.SampleDataPurgeResult result = odooTenantProvisioner.purgeSampleData(vendorId);
            Map<String, Object> body = toPurgeBody(result);
            body.put("idempotent", false);
            return ApiResult.ok(body);
        } catch (BusinessException e) {
            throw e;
        } catch (IllegalArgumentException e) {
            throw new BusinessException(40410, "Store not found");
        } catch (IllegalStateException e) {
            throw new BusinessException(42210, e.getMessage() == null
                    ? "Could not remove sample data."
                    : e.getMessage());
        }
    }

    private static Long resolveVendorId() {
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) {
            TenantHolder.ResolvedTenant tenant = TenantHolder.get();
            if (tenant != null && tenant.vendor() != null) {
                vendorId = tenant.vendor().getId();
            }
        }
        if (vendorId == null) {
            throw new BusinessException(40100, "Unauthorized");
        }
        return vendorId;
    }

    private static Map<String, Object> toStatusBody(OdooTenantProvisioner.SampleDataStatus status) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("dummyDataRequested", status.dummyDataRequested());
        body.put("sampleDataClearedAt", status.sampleDataClearedAt());
        body.put("state", status.state());
        body.put("demoProductCount", status.demoProductCount());
        body.put("demoCustomerCount", status.demoCustomerCount());
        body.put("demoOrderCount", status.demoOrderCount());
        body.put("nonDemoPaidOrderCount", status.nonDemoPaidOrderCount());
        body.put("canPurge", status.canPurge());
        body.put("archiveOnly", status.archiveOnly());
        body.put("confirmPhrase", CONFIRM_PHRASE);
        return body;
    }

    private static Map<String, Object> toPurgeBody(OdooTenantProvisioner.SampleDataPurgeResult result) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("state", result.state());
        body.put("archiveOnly", result.archiveOnly());
        body.put("productsArchived", result.productsArchived());
        body.put("customersArchived", result.customersArchived());
        body.put("sessionsClosed", result.sessionsClosed());
        body.put("demoOrderCount", result.demoOrderCount());
        body.put("sampleDataClearedAt", result.sampleDataClearedAt());
        body.put("message", result.archiveOnly()
                ? "Sample catalogue archived. Live metrics exclude demo seed orders; real sales were kept."
                : "Sample catalogue archived. Live metrics exclude demo seed orders.");
        return body;
    }
}
