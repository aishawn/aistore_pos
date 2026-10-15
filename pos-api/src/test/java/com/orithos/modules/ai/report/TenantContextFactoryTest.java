package com.orithos.modules.ai.report;

import com.orithos.modules.user.UserService;
import com.orithos.security.AuthUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TenantContextFactoryTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void usesCurrentDatabasePermissionsInsteadOfStaleTokenAuthorities() {
        UserReportingOutletMapper outlets = mock(UserReportingOutletMapper.class);
        UserService users = mock(UserService.class);
        when(outlets.findOutletIds(7L)).thenReturn(List.of(1L));
        // The token still carries the cost grant, but the user's current role no longer does.
        when(users.authoritiesForActiveUser(7L)).thenReturn(List.of(TenantContext.PERM_QUERY));
        var authentication = new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "cashier", false, 1L, 1L), null,
                List.of(() -> TenantContext.PERM_QUERY, () -> TenantContext.PERM_COST));
        SecurityContextHolder.getContext().setAuthentication(authentication);

        TenantContext tenant = new TenantContextFactory(outlets, users).fromSecurity();

        assertEquals(1L, tenant.vendorId());
        assertTrue(tenant.canQueryReport());
        assertFalse(tenant.canQueryCost());
    }
}
