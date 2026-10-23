package com.orithos.modules.user;

import com.orithos.modules.user.entity.Permission;
import com.orithos.modules.user.entity.Role;
import com.orithos.modules.user.entity.User;
import com.orithos.modules.user.mapper.RoleMapper;
import com.orithos.modules.user.mapper.UserMapper;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class UserServiceAuthoritiesTest {

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
