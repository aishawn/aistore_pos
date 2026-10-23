package com.orithos.security;

import com.orithos.common.BusinessException;
import com.orithos.modules.user.StorePermissionCatalog;
import com.orithos.modules.user.UserService;
import com.orithos.modules.user.entity.Role;
import com.orithos.modules.user.entity.User;
import com.orithos.modules.user.mapper.RoleMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PermissionAccessTest {

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void adminHasEveryPermission() {
        UserService users = mock(UserService.class);
        RoleMapper roles = mock(RoleMapper.class);
        PermissionAccess access = new PermissionAccess(users, roles);
        asUser(new AuthUser(1L, "admin", true, 1L, 1L));

        assertTrue(access.hasPermission("settings.integrations"));
        assertTrue(access.hasPermission("sell.checkout"));
    }

    @Test
    void managerPermissionUsesLiveAuthorities() {
        UserService users = mock(UserService.class);
        RoleMapper roles = mock(RoleMapper.class);
        when(users.authoritiesForActiveUser(2L)).thenReturn(List.of(
                "ROLE_MANAGER",
                "perm:settings.permissions",
                "perm:sell.checkout"
        ));
        PermissionAccess access = new PermissionAccess(users, roles);
        asUser(new AuthUser(2L, "manager", false, 1L, 1L));

        assertTrue(access.hasPermission("settings.permissions"));
        assertFalse(access.hasPermission("settings.integrations"));
        access.requirePermissionsManager();
    }

    @Test
    void clerkWithoutSettingsPermissionsIsRejected() {
        UserService users = mock(UserService.class);
        RoleMapper roles = mock(RoleMapper.class);
        when(users.authoritiesForActiveUser(3L)).thenReturn(List.of("ROLE_CLERK", "perm:sell.checkout"));
        PermissionAccess access = new PermissionAccess(users, roles);
        asUser(new AuthUser(3L, "clerk", false, 1L, 1L));

        BusinessException ex = assertThrows(BusinessException.class, access::requirePermissionsManager);
        assertEquals(40300, ex.getCode());
    }

    @Test
    void roleCodePrefersIsAdminThenManagedId() {
        UserService users = mock(UserService.class);
        RoleMapper roles = mock(RoleMapper.class);
        PermissionAccess access = new PermissionAccess(users, roles);

        User admin = new User();
        admin.setIsAdmin(true);
        assertEquals(StorePermissionCatalog.MANAGED_ADMIN, access.roleCode(admin));

        Role manager = new Role();
        manager.setManagedId("manager");
        when(roles.findById(8L)).thenReturn(manager);
        User staff = new User();
        staff.setIsAdmin(false);
        staff.setRoleId(8L);
        assertEquals(StorePermissionCatalog.MANAGED_MANAGER, access.roleCode(staff));
    }

    private static void asUser(AuthUser user) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null, List.of()));
    }
}
