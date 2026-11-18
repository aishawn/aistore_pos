package com.orithos.modules.eftpos;

import com.orithos.common.ApiResult;
import com.orithos.modules.eftpos.dto.CreateEftposAttemptRequest;
import com.orithos.modules.eftpos.dto.EftposAttemptView;
import com.orithos.modules.eftpos.dto.RegisterEftposBindingView;
import com.orithos.modules.eftpos.dto.UpsertRegisterEftposBindingRequest;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/retail/registers/{registerId}/eftpos")
public class RetailEftposController {
    private final EftposService service;
    private final PermissionAccess permissions;

    public RetailEftposController(EftposService service, PermissionAccess permissions) {
        this.service = service;
        this.permissions = permissions;
    }

    @GetMapping("/binding")
    public ApiResult<RegisterEftposBindingView> binding(@PathVariable Long registerId) {
        return ApiResult.ok(service.getBinding(registerId));
    }

    @PutMapping("/binding")
    public ApiResult<RegisterEftposBindingView> saveBinding(
            @PathVariable Long registerId,
            @RequestBody UpsertRegisterEftposBindingRequest body) {
        permissions.requirePermission("settings.store");
        return ApiResult.ok(service.saveBinding(registerId, body));
    }

    @PostMapping("/attempts")
    public ApiResult<EftposAttemptView> createAttempt(
            @PathVariable Long registerId,
            @RequestBody CreateEftposAttemptRequest body) {
        return ApiResult.ok(service.createAttempt(registerId, body));
    }

    @GetMapping("/attempts/by-order/{orderUuid}")
    public ApiResult<EftposAttemptView> getAttempt(
            @PathVariable Long registerId,
            @PathVariable String orderUuid) {
        return ApiResult.ok(service.getAttemptByOrderUuid(registerId, orderUuid));
    }

    @PostMapping("/attempts/{attemptId}/simulate-approval")
    public ApiResult<EftposAttemptView> simulateApproval(
            @PathVariable Long registerId,
            @PathVariable Long attemptId) {
        permissions.requirePermission("settings.store");
        return ApiResult.ok(service.simulateApproval(registerId, attemptId));
    }
}