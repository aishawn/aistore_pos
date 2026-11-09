package com.orithos.modules.payment;

import com.orithos.common.BusinessException;
import com.orithos.config.NativePosGate;
import com.orithos.security.AuthUser;
import com.orithos.security.PermissionAccess;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RetailPaymentMethodControllerTest {
    private final PaymentMethodMapper mapper = mock(PaymentMethodMapper.class);
    private final PermissionAccess permissions = mock(PermissionAccess.class);

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void listsOnlyAssignmentsForTheAuthenticatedVendorAndOutlet() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "manager", false, 12L, 3L), null, List.of()));
        RegisterPaymentMethodView assignment = new RegisterPaymentMethodView();
        assignment.setPaymentMethodId(5L);
        assignment.setName("Cash");
        assignment.setType("CASH");
        assignment.setRegisterId(11L);
        assignment.setRegisterName("Front counter");
        when(mapper.findAssignedForOutlet(3L, 12L)).thenReturn(List.of(assignment));

        var response = new RetailPaymentMethodController(mapper, permissions, gate("3")).list();

        assertEquals(0, response.code());
        assertTrue(response.data().nativePosEnabled());
        assertEquals(List.of(assignment), response.data().assignments());
        verify(permissions).requirePermission("settings.view");
        verify(mapper).findAssignedForOutlet(3L, 12L);
        verifyNoMoreInteractions(mapper);
    }

    @Test
    void leavesUncutOverStoresOnTheirExistingPaymentConfiguration() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "manager", false, 12L, 3L), null, List.of()));
        var response = new RetailPaymentMethodController(mapper, permissions, gate("")).list();

        assertEquals(0, response.code());
        assertFalse(response.data().nativePosEnabled());
        assertTrue(response.data().assignments().isEmpty());
        verify(mapper, never()).findAssignedForOutlet(anyLong(), anyLong());
    }

    @Test
    void rejectsRequestsWithoutAuthenticatedTenantScope() {
        var controller = new RetailPaymentMethodController(mapper, permissions, gate("3"));
        assertThrows(BusinessException.class, controller::list);
        verify(permissions).requirePermission("settings.view");
        verifyNoInteractions(mapper);
    }

    private static NativePosGate gate(String vendors) {
        return new NativePosGate(vendors, "pos_test", "pos_test", "uat", mock(JdbcTemplate.class));
    }
}
