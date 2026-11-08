package com.orithos.config;

import com.orithos.common.BusinessException;
import com.orithos.security.AuthUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.junit.jupiter.api.Assertions.*;

class NativePosGateTest {
    @AfterEach
    void clearAuthentication() { SecurityContextHolder.clearContext(); }

    @Test
    void onlyExplicitlyEnabledVendorMayUseNativeWrites() {
        NativePosGate gate = new NativePosGate("1, 55");
        authenticate(1L);
        assertDoesNotThrow(gate::requireEnabled);

        authenticate(55L);
        assertDoesNotThrow(gate::requireEnabled);

        authenticate(2L);
        BusinessException denied = assertThrows(BusinessException.class, gate::requireEnabled);
        assertEquals(40300, denied.getCode());
    }

    @Test
    void emptyAllowlistFailsClosedAndUnauthenticatedRequestsAreRejected() {
        NativePosGate gate = new NativePosGate("");
        authenticate(1L);
        assertEquals(40300, assertThrows(BusinessException.class, gate::requireEnabled).getCode());

        SecurityContextHolder.clearContext();
        assertEquals(40100, assertThrows(BusinessException.class, gate::requireEnabled).getCode());
    }

    private static void authenticate(Long vendorId) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "cashier", false, 12L, vendorId), null));
    }
}
