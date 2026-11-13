package com.orithos.modules.register;

import com.orithos.common.BusinessException;
import com.orithos.modules.payment.PaymentMethodMapper;
import com.orithos.security.AuthUser;
import com.orithos.security.PermissionAccess;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

class RegisterPaymentMethodControllerTest {
    private final RegisterMapper registers = mock(RegisterMapper.class);
    private final PaymentMethodMapper paymentMethods = mock(PaymentMethodMapper.class);
    private final PermissionAccess permissions = mock(PermissionAccess.class);
    private final RegisterPaymentMethodController controller =
            new RegisterPaymentMethodController(registers, paymentMethods, permissions);

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void replacesAssignmentsOnlyForTheAuthenticatedOutletAndDeduplicatesIds() {
        authenticate();
        when(registers.findByIdAndVendor(11L, 3L)).thenReturn(register(11L, 12L));
        when(paymentMethods.countActiveIdsInOutlet(List.of(5L, 6L), 12L)).thenReturn(2);

        var response = controller.replace(11L, new RegisterPaymentMethodController.AssignmentRequest(
                List.of(5L, 5L, 6L)));

        assertEquals(List.of(5L, 6L), response.data());
        verify(permissions).requirePermission("settings.store");
        verify(paymentMethods).deleteRegisterAssignments(11L, 12L);
        verify(paymentMethods).insertRegisterAssignment(11L, 5L, 12L);
        verify(paymentMethods).insertRegisterAssignment(11L, 6L, 12L);
    }

    @Test
    void rejectsPaymentMethodsFromAnotherOutletBeforeChangingAssignments() {
        authenticate();
        when(registers.findByIdAndVendor(11L, 3L)).thenReturn(register(11L, 12L));
        when(paymentMethods.countActiveIdsInOutlet(List.of(99L), 12L)).thenReturn(0);

        assertThrows(BusinessException.class, () -> controller.replace(11L,
                new RegisterPaymentMethodController.AssignmentRequest(List.of(99L))));

        verify(paymentMethods, never()).deleteRegisterAssignments(anyLong(), anyLong());
        verify(paymentMethods, never()).insertRegisterAssignment(anyLong(), anyLong(), anyLong());
    }

    @Test
    void rejectsRegistersOutsideTheAuthenticatedOutlet() {
        authenticate();
        when(registers.findByIdAndVendor(11L, 3L)).thenReturn(register(11L, 88L));

        assertThrows(BusinessException.class, () -> controller.list(11L));

        verifyNoInteractions(paymentMethods);
    }

    private static void authenticate() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "manager", false, 12L, 3L), null, List.of()));
    }

    private static Register register(Long id, Long outletId) {
        Register register = new Register();
        register.setId(id);
        register.setOutletId(outletId);
        return register;
    }
}
