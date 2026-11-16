package com.orithos.modules.auth;

import com.orithos.modules.auth.dto.TokenResponse;
import com.orithos.modules.auth.dto.WorkContextRequest;
import com.orithos.modules.user.UserService;
import com.orithos.modules.user.entity.User;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import com.orithos.security.AccountTokenStore;
import com.orithos.security.AuthUser;
import com.orithos.security.CurrentUser;
import com.orithos.security.JwtProperties;
import com.orithos.security.JwtService;
import com.orithos.security.PermissionAccess;
import com.orithos.security.TokenStore;
import com.orithos.tenant.PlatformAccessService;
import com.orithos.tenant.TenantHolder;
import com.orithos.tenant.TenantProperties;
import com.orithos.tenant.TenantSlugParser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AuthControllerWorkContextTest {
    private final UserService users = mock(UserService.class);
    private final JwtProperties jwtProperties = new JwtProperties();
    private JwtService jwt;
    private final TokenStore tokens = mock(TokenStore.class);
    private final PermissionAccess permissions = mock(PermissionAccess.class);
    private final OutletAccessService outletAccess = mock(OutletAccessService.class);
    private final PlatformAccessService platformAccess = mock(PlatformAccessService.class);
    private final VendorMapper vendors = mock(VendorMapper.class);
    private AuthController controller;
    private User user;

    @BeforeEach
    void setUp() {
        jwtProperties.setSecret("01234567890123456789012345678901");
        jwt = new JwtService(jwtProperties);
        controller = new AuthController(
                users, jwt, tokens, jwtProperties, mock(AccountLifecycleService.class),
                vendors, mock(TenantSlugParser.class),
                mock(TenantProperties.class), mock(AccountTokenStore.class), platformAccess,
                permissions, outletAccess);
        user = new User();
        user.setId(7L);
        user.setName("Store admin");
        user.setUsername("admin");
        user.setIsAdmin(true);
        user.setOutletId(1L);
        user.setVendorId(55L);
        Vendor vendor = new Vendor();
        vendor.setId(55L);
        vendor.setStatus("active");
        when(vendors.findById(55L)).thenReturn(vendor);
        when(outletAccess.requireVendor()).thenReturn(55L);
        when(users.require(7L)).thenReturn(user);
        when(users.authorities(user)).thenReturn(List.of());
        when(permissions.roleCode(user)).thenReturn("ADMIN");
        when(permissions.permissionSafeNames(user)).thenReturn(List.of());
        when(tokens.currentRefreshVersion(7L)).thenReturn(0L);
        when(tokens.refreshValid(eq(7L), anyString(), anyString(), eq(0L))).thenReturn(true);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        TenantHolder.clear();
    }

    @Test
    void refreshPreservesTheOutletSelectedForThatSession() {
        var refresh = jwt.issueRefresh(7L, "admin", 87L, "session-a", 0L);

        TokenResponse response = controller.refresh(Map.of("refreshToken", refresh.token())).data();

        assertEquals(87L, response.user().outletId());
        assertEquals(87L, JwtService.claimAsLong(jwt.parse(response.accessToken()), "outletId"));
        assertEquals(87L, JwtService.claimAsLong(jwt.parse(response.refreshToken()), "outletId"));
        verify(outletAccess).requireOutletAccess(87L, user, 55L);
    }

    @Test
    void meReturnsTheOutletFromTheAuthenticatedAccessToken() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "admin", true, 87L, 55L, "session-a"), null));

        Map<String, Object> response = controller.me().data();

        assertEquals(87L, response.get("outletId"));
    }

    @Test
    void workContextIssuesTokensForTheValidatedOutletAndRegister() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "admin", true, 1L, 55L, "session-a"), null));

        TokenResponse response = controller.workContext(new WorkContextRequest(87L, 249L, false)).data();

        assertEquals(87L, response.user().outletId());
        assertEquals(87L, JwtService.claimAsLong(jwt.parse(response.accessToken()), "outletId"));
        verify(outletAccess).requireOutletAccess(87L, user, 55L);
        verify(outletAccess).requireRegisterForOutlet(249L, 87L, 55L);
    }
}
