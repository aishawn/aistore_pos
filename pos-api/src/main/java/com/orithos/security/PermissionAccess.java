package com.orithos.security;

import com.orithos.common.BusinessException;
import com.orithos.modules.user.StorePermissionCatalog;
import com.orithos.modules.user.UserService;
import com.orithos.modules.user.entity.Role;
import com.orithos.modules.user.entity.User;
import com.orithos.modules.user.mapper.RoleMapper;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Live permission checks for store role gates (prefer DB over stale JWT claims). */
@Component
public class PermissionAccess {

    private final UserService userService;
    private final RoleMapper roleMapper;

    public PermissionAccess(UserService userService, RoleMapper roleMapper) {
        this.userService = userService;
        this.roleMapper = roleMapper;
    }

    public void requirePermission(String safeName) {
        if (!hasPermission(safeName)) {
            throw new BusinessException(40300, "You do not have permission for this action");
        }
    }

    /** Admin or anyone with settings.permissions (店长). */
    public void requirePermissionsManager() {
        AuthUser current = CurrentUser.get();
        if (current == null) throw new BusinessException(40100, "Unauthorized");
        if (current.admin() || hasPermission("settings.permissions")) return;
        throw new BusinessException(40300, "Permission to manage staff access is required");
    }

    /** Admin or anyone with settings.users. */
    public void requireUsersManager() {
        AuthUser current = CurrentUser.get();
        if (current == null) throw new BusinessException(40100, "Unauthorized");
        if (current.admin() || hasPermission("settings.users")) return;
        throw new BusinessException(40300, "Permission to manage staff is required");
    }

    public boolean hasPermission(String safeName) {
        AuthUser current = CurrentUser.get();
        if (current == null) return false;
        if (current.admin()) return true;
        Long id = current.id();
        if (id == null) return false;
        List<String> authorities = userService.authoritiesForActiveUser(id);
        String needle = "perm:" + safeName;
        for (String authority : authorities) {
            if (needle.equals(authority)) return true;
        }
        return false;
    }

    /** Resolve ADMIN|MANAGER|CLERK|NONE from the live user row. */
    public String roleCode(User user) {
        if (user == null) return "NONE";
        if (Boolean.TRUE.equals(user.getIsAdmin())) return StorePermissionCatalog.MANAGED_ADMIN;
        if (user.getRoleId() == null) return "NONE";
        Role role = roleMapper.findById(user.getRoleId());
        if (role == null || role.getManagedId() == null || role.getManagedId().isBlank()) return "NONE";
        return role.getManagedId().trim().toUpperCase(Locale.ROOT);
    }

    public List<String> permissionSafeNames(User user) {
        LinkedHashSet<String> names = new LinkedHashSet<>();
        if (user == null) return List.of();
        if (Boolean.TRUE.equals(user.getIsAdmin())) {
            names.addAll(StorePermissionCatalog.allSafeNames());
            return new ArrayList<>(names);
        }
        for (String authority : userService.authorities(user)) {
            if (authority != null && authority.startsWith("perm:")) {
                names.add(authority.substring("perm:".length()));
            }
        }
        return new ArrayList<>(names);
    }

    /** Token authorities currently on the SecurityContext (may be stale). */
    public static Set<String> tokenAuthorities() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return Set.of();
        LinkedHashSet<String> set = new LinkedHashSet<>();
        for (GrantedAuthority authority : auth.getAuthorities()) {
            if (authority != null && authority.getAuthority() != null) {
                set.add(authority.getAuthority());
            }
        }
        return set;
    }
}
