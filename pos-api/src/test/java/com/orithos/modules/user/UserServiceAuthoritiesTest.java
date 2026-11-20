package com.orithos.modules.user;

import com.orithos.modules.user.entity.Permission;
import com.orithos.modules.user.entity.Role;
import com.orithos.modules.user.entity.User;
import com.orithos.modules.user.mapper.RoleMapper;
import com.orithos.modules.user.mapper.UserMapper;
import com.orithos.modules.user.mapper.LoginStaffOption;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class UserServiceAuthoritiesTest {

    @Test
    void authenticationCanSkipPasswordOnlyWhenTenantRequiresNoPassword() {
        UserMapper users = mock(UserMapper.class);
        RoleMapper roles = mock(RoleMapper.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        UserService service = new UserService(users, roles, encoder);
        User staff = new User();
        staff.setVendorId(55L);
        staff.setUsername("clerk");
        when(users.findByVendorAndUsername(55L, "clerk")).thenReturn(staff);

        assertEquals(staff, service.authenticate(55L, "clerk", null, false));
        verify(encoder, org.mockito.Mockito.never()).matches(org.mockito.ArgumentMatchers.isNull(), org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void authenticationStillRejectsMissingPasswordWhenTenantRequiresIt() {
        UserMapper users = mock(UserMapper.class);
        RoleMapper roles = mock(RoleMapper.class);
        UserService service = new UserService(users, roles, mock(PasswordEncoder.class));
        User staff = new User();
        staff.setPasswordHash("hash");
        when(users.findByVendorAndUsername(55L, "clerk")).thenReturn(staff);

        assertThrows(com.orithos.common.BusinessException.class,
                () -> service.authenticate(55L, "clerk", null, true));
    }

    @Test
    void loginOptionsAreQueriedOnlyForRequestedVendor() {
        UserMapper users = mock(UserMapper.class);
        UserService service = new UserService(users, mock(RoleMapper.class), mock(PasswordEncoder.class));
        List<LoginStaffOption> options = List.of(new LoginStaffOption(8L, "Clerk", "clerk"));
        when(users.findLoginOptionsByVendor(55L)).thenReturn(options);

        assertEquals(options, service.loginOptions(55L));
        verify(users).findLoginOptionsByVendor(55L);
    }

    @Test
    void adminReceivesFullPermissionCatalog() {
        UserMapper users = mock(UserMapper.class);
        RoleMapper roles = mock(RoleMapper.class);
        UserService service = new UserService(users, roles, mock(PasswordEncoder.class));

        User admin = new User();
        admin.setId(1L);
        admin.setIsAdmin(true);

        List<String> authorities = service.authorities(admin);
        assertTrue(authorities.contains("ROLE_ADMIN"));
        assertTrue(authorities.contains("perm:sell.checkout"));
        assertTrue(authorities.contains("perm:settings.integrations"));
        assertTrue(authorities.contains("perm:ai.report.query"));
    }

    @Test
    void clerkReceivesRolePermissionsAndManagedAuthority() {
        UserMapper users = mock(UserMapper.class);
        RoleMapper roles = mock(RoleMapper.class);
        UserService service = new UserService(users, roles, mock(PasswordEncoder.class));

        Role clerk = new Role();
        clerk.setId(9L);
        clerk.setName("Clerk");
        clerk.setManagedId("CLERK");
        when(roles.findById(9L)).thenReturn(clerk);

        Permission sell = new Permission();
        sell.setId(9201);
        sell.setSafeName("sell.checkout");
        when(roles.permissionsOfRole(9L)).thenReturn(List.of(sell));

        User user = new User();
        user.setId(3L);
        user.setIsAdmin(false);
        user.setRoleId(9L);

        List<String> authorities = service.authorities(user);
        assertTrue(authorities.contains("ROLE_CLERK"));
        assertTrue(authorities.contains("perm:sell.checkout"));
    }
}
