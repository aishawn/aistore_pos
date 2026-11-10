package com.orithos.modules.payment;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.config.NativePosGate;
import com.orithos.security.CurrentUser;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/retail/payment-methods")
public class RetailPaymentMethodController {
    private final PaymentMethodMapper mapper;
    private final PermissionAccess permissions;
    private final NativePosGate nativePosGate;

    public RetailPaymentMethodController(PaymentMethodMapper mapper, PermissionAccess permissions,
                                         NativePosGate nativePosGate) {
        this.mapper = mapper;
        this.permissions = permissions;
        this.nativePosGate = nativePosGate;
    }

    @GetMapping
    public ApiResult<RetailPaymentMethodResponse> list() {
        Long vendorId = CurrentUser.vendorId();
        Long outletId = CurrentUser.outletId();
        if (vendorId == null || outletId == null) {
            throw new BusinessException(40100, "Authenticated store and outlet are required.");
        }
        boolean nativePosEnabled = nativePosGate.enabledFor(vendorId);
        // Native sell needs payment methods for cashiers; settings-only when native POS is off.
        if (!nativePosEnabled) {
            permissions.requirePermission("settings.view");
        }
        List<RegisterPaymentMethodView> assignments = nativePosEnabled
                ? mapper.findAssignedForOutlet(vendorId, outletId)
                : List.of();
        return ApiResult.ok(new RetailPaymentMethodResponse(nativePosEnabled, assignments));
    }
}
