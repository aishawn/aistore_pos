package com.orithos.config;

import com.orithos.common.BusinessException;
import com.orithos.security.AuthUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.mockito.Mockito.*;

import static org.junit.jupiter.api.Assertions.*;

class NativePosGateTest {
    @AfterEach
    void clearAuthentication() { SecurityContextHolder.clearContext(); }

    @Test
    void onlyExplicitlyEnabledVendorMayUseNativeWrites() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject("select current_database()", String.class)).thenReturn("pos_demo_uat");
        NativePosGate gate = new NativePosGate("1, 55", "pos_demo_uat", "pos_demo_uat", "uat", jdbc);
        authenticate(1L);
        assertDoesNotThrow(gate::requireEnabled);

        authenticate(55L);
        assertDoesNotThrow(gate::requireEnabled);

        authenticate(2L);
        BusinessException denied = assertThrows(BusinessException.class, gate::requireEnabled);
        assertEquals(40300, denied.getCode());
    }

    @Test
    void databaseIdentityMustMatchAndUatMustUseItsExplicitIsolationDatabase() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject("select current_database()", String.class)).thenReturn("production");
        NativePosGate wrongRuntimeDatabase = new NativePosGate(
                "1", "pos_demo_uat", "pos_demo_uat", "uat", jdbc);
        authenticate(1L);
        assertEquals(40300, assertThrows(BusinessException.class, wrongRuntimeDatabase::requireEnabled).getCode());

        NativePosGate wrongConfiguredIsolation = new NativePosGate(
                "1", "pos_demo_uat", "pos_production", "uat", jdbc);
        assertEquals(40300, assertThrows(BusinessException.class, wrongConfiguredIsolation::requireEnabled).getCode());

        NativePosGate productionWithoutExpectedDatabase = new NativePosGate("1", "", "", "production", jdbc);
        assertEquals(40300, assertThrows(BusinessException.class, productionWithoutExpectedDatabase::requireEnabled).getCode());

        NativePosGate sharedDefaultDatabase = new NativePosGate(
                "1", "postgres", "postgres", "uat", jdbc);
        assertEquals(40300, assertThrows(BusinessException.class, sharedDefaultDatabase::requireEnabled).getCode());
    }

    @Test
    void emptyAllowlistFailsClosedAndUnauthenticatedRequestsAreRejected() {
        NativePosGate gate = new NativePosGate("", "pos_demo_uat", "pos_demo_uat", "uat", mock(JdbcTemplate.class));
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
