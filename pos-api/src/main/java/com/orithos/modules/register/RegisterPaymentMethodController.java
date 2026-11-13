package com.orithos.modules.register;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.modules.payment.PaymentMethodMapper;
import com.orithos.security.CurrentUser;
import com.orithos.security.PermissionAccess;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashSet;
import java.util.List;

@RestController
@RequestMapping("/api/registers/{registerId}/payment-methods")
public class RegisterPaymentMethodController {
    private final RegisterMapper registers;
    private final PaymentMethodMapper paymentMethods;
    private final PermissionAccess permissions;

    public RegisterPaymentMethodController(RegisterMapper registers, PaymentMethodMapper paymentMethods,
                                           PermissionAccess permissions) {
        this.registers = registers;
        this.paymentMethods = paymentMethods;
        this.permissions = permissions;
    }

    @GetMapping
    public ApiResult<List<Long>> list(@PathVariable Long registerId) {
        Register register = requireRegister(registerId);
        return ApiResult.ok(paymentMethods.findIdsForRegister(registerId, register.getOutletId()));
    }

    @PutMapping
    @Transactional
    public ApiResult<List<Long>> replace(@PathVariable Long registerId, @RequestBody AssignmentRequest request) {
        permissions.requirePermission("settings.store");
        Register register = requireRegister(registerId);
        List<Long> requestedIds = request == null || request.paymentMethodIds() == null
                ? List.of() : request.paymentMethodIds();
        if (requestedIds.stream().anyMatch(id -> id == null || id <= 0)) {
            throw new BusinessException(40000, "Payment method ids must be positive.");
        }
        List<Long> ids = List.copyOf(new LinkedHashSet<>(requestedIds));
        if (!ids.isEmpty() && paymentMethods.countActiveIdsInOutlet(ids, register.getOutletId()) != ids.size()) {
            throw new BusinessException(40000, "Payment methods must be active and belong to this outlet.");
        }
        paymentMethods.deleteRegisterAssignments(registerId, register.getOutletId());
        for (Long id : ids) paymentMethods.insertRegisterAssignment(registerId, id, register.getOutletId());
        return ApiResult.ok(ids);
    }

    private Register requireRegister(Long registerId) {
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null || CurrentUser.outletId() == null) {
            throw new BusinessException(40100, "Authenticated store and outlet are required.");
        }
        Register register = registers.findByIdAndVendor(registerId, vendorId);
        if (register == null || !CurrentUser.outletId().equals(register.getOutletId())) {
            throw new BusinessException(40400, "Register not found.");
        }
        return register;
    }

    public record AssignmentRequest(List<Long> paymentMethodIds) {}
}
