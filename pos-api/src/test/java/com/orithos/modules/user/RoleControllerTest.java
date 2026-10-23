package com.orithos.modules.user;

import com.orithos.common.BusinessException;
import com.orithos.modules.user.entity.Permission;
import com.orithos.modules.user.entity.Role;
import com.orithos.modules.user.mapper.PermissionMapper;
import com.orithos.modules.user.mapper.RoleMapper;
import com.orithos.security.AuthUser;
import com.orithos.security.PermissionAccess;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RoleControllerTest {

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void managerCanUpdateClerkPermissions() {
        RoleMapper roles = mock(RoleMapper.class);
        PermissionMapper permissions = mock(PermissionMapper.class);
        PermissionAccess access = mock(PermissionAccess.class);
        RoleController controller = new RoleController(roles, permissions, access);

        asUser(new AuthUser(2L, "manager", false, 1L, 1L));

        Role clerk = new Role();
        clerk.setId(30L);
        clerk.setName("Clerk");
        clerk.setManagedId("CLERK");
        when(roles.findById(30L)).thenReturn(clerk);

        Permission sell = new Permission();
        sell.setId(9201);
        sell.setSafeName("sell.checkout");
        when(permissions.findAll()).thenReturn(List.of(sell));

        controller.setRolePermissions(30L, List.of(9201));

        verify(access).requirePermissionsManager();
        verify(roles).clearPermissions(30L);
        verify(roles).addPermission(30L, 9201);
    }

    @Test
    void managerCannotUpdateManagerPermissions() {
        RoleMapper roles = mock(RoleMapper.class);
        PermissionMapper permissions = mock(PermissionMapper.class);
        PermissionAccess access = mock(PermissionAccess.class);
        RoleController controller = new RoleController(roles, permissions, access);

        asUser(new AuthUser(2L, "manager", false, 1L, 1L));

        Role manager = new Role();
        manager.setId(20L);
        manager.setName("Manager");
        manager.setManagedId("MANAGER");
        when(roles.findById(20L)).thenReturn(manager);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> controller.setRolePermissions(20L, List.of(9201)));
        assertEquals(40300, ex.getCode());
        verify(roles, never()).clearPermissions(eq(20L));
        verify(roles, never()).addPermission(eq(20L), eq(9201));
        verify(permissions, never()).findAll();
    }

    @Test
    void createCustomRoleIsRejected() {
        RoleController controller = new RoleController(mock(RoleMapper.class), mock(PermissionMapper.class), mock(PermissionAccess.class));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> controller.createRole(new RoleController.RoleRequest("Custom", List.of())));
        assertEquals(40300, ex.getCode());
    }

    private static void asUser(AuthUser user) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null, List.of()));
    }
}
