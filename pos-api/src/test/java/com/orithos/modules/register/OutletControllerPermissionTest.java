package com.orithos.modules.register;

import com.orithos.security.AuthUser;
import com.orithos.security.PermissionAccess;
import com.orithos.modules.auth.OutletAccessService;
import com.orithos.modules.user.UserService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.mockito.Mockito.*;

class OutletControllerPermissionTest {
    private final OutletMapper mapper = mock(OutletMapper.class);
    private final PermissionAccess permissions = mock(PermissionAccess.class);
    private final OutletController controller = new OutletController(
            mapper, permissions, mock(OutletAccessService.class), mock(UserService.class));

    @BeforeEach
    void authenticate() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "manager", false, 12L, 55L), null));
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void createUsesTheSameStorePermissionExposedBySetupUiAndOverridesVendorId() {
        Outlet outlet = new Outlet();
        outlet.setName("New outlet");
        outlet.setVendorId(1L);

        controller.create(outlet);

        verify(permissions).requirePermission("settings.store");
        verify(mapper).insert(argThat(saved -> saved.getVendorId().equals(55L)));
    }
}
