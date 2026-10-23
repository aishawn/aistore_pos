package com.orithos.modules.user;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.modules.user.entity.Permission;
import com.orithos.modules.user.entity.Role;
import com.orithos.modules.user.mapper.PermissionMapper;
import com.orithos.modules.user.mapper.RoleMapper;
import com.orithos.security.AdminAccess;
import com.orithos.security.CurrentUser;
import com.orithos.security.PermissionAccess;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@RestController
@RequestMapping("/api")
public class RoleController {

    private final RoleMapper roleMapper;
    private final PermissionMapper permissionMapper;
    private final PermissionAccess permissionAccess;

    public RoleController(RoleMapper roleMapper, PermissionMapper permissionMapper, PermissionAccess permissionAccess) {
        this.roleMapper = roleMapper;
        this.permissionMapper = permissionMapper;
        this.permissionAccess = permissionAccess;
    }

    @GetMapping("/roles")
    public ApiResult<List<Role>> listRoles() {
        permissionAccess.requirePermissionsManager();
        List<Role> managed = roleMapper.findManagedRoles();
        if (!managed.isEmpty()) {
            return ApiResult.ok(managed);
        }
        // Fallback before migrator has run.
        AdminAccess.requireAdmin();
        return ApiResult.ok(roleMapper.findAll());
    }

    @GetMapping("/roles/{id}")
    public ApiResult<Role> getRole(@PathVariable Long id) {
        permissionAccess.requirePermissionsManager();
        return ApiResult.ok(requireReadableRole(id));
    }

    @PostMapping("/roles")
    @Transactional
    public ApiResult<Role> createRole(@RequestBody RoleRequest req) {
        throw new BusinessException(40300, "Custom roles are disabled. Use Admin, Manager, or Clerk.");
    }

    @PutMapping("/roles/{id}")
    @Transactional
    public ApiResult<Role> updateRole(@PathVariable Long id, @RequestBody RoleRequest req) {
        permissionAccess.requirePermissionsManager();
        Role r = requireWritableClerkRole(id);
        if (req.permissionIds() != null) {
            replacePermissions(id, req.permissionIds());
        }
        // Managed role display names stay fixed.
        return ApiResult.ok(r);
    }

    @DeleteMapping("/roles/{id}")
    @Transactional
    public ApiResult<Void> deleteRole(@PathVariable Long id) {
        Role role = requireRole(id);
        if (isManaged(role)) {
            throw new BusinessException(40300, "Managed roles cannot be deleted");
        }
        AdminAccess.requireAdmin();
        if (roleMapper.countActiveUsers(id) > 0) {
            throw new BusinessException(40901, "Reassign staff before deleting this role");
        }
        roleMapper.clearPermissions(id);
        roleMapper.delete(id);
        return ApiResult.ok();
    }

    @PostMapping("/roles/{id}/clone")
    @Transactional
    public ApiResult<Role> cloneRole(@PathVariable Long id) {
        throw new BusinessException(40300, "Custom roles are disabled. Use Admin, Manager, or Clerk.");
    }

    @GetMapping("/roles/{id}/permissions")
    public ApiResult<List<Permission>> rolePermissions(@PathVariable Long id) {
        permissionAccess.requirePermissionsManager();
        requireReadableRole(id);
        return ApiResult.ok(roleMapper.permissionsOfRole(id));
    }

    @PutMapping("/roles/{id}/permissions")
    public ApiResult<Void> setRolePermissions(@PathVariable Long id, @RequestBody List<Integer> permissionIds) {
        permissionAccess.requirePermissionsManager();
        requireWritableClerkRole(id);
        replacePermissions(id, permissionIds);
        return ApiResult.ok();
    }

    @GetMapping("/permissions")
    public ApiResult<List<Permission>> listPermissions() {
        permissionAccess.requirePermissionsManager();
        return ApiResult.ok(permissionMapper.findAll());
    }

    private Role requireRole(Long id) {
        Role role = roleMapper.findById(id);
        if (role == null) throw new BusinessException(40400, "Role not found");
        return role;
    }

    private Role requireReadableRole(Long id) {
        Role role = requireRole(id);
        if (CurrentUser.get() != null && CurrentUser.get().admin()) {
            return role;
        }
        // Managers may read managed roles (matrix UI) but only write Clerk.
        if (!isManaged(role)) {
            throw new BusinessException(40300, "Only managed roles are available");
        }
        return role;
    }

    private Role requireWritableClerkRole(Long id) {
        Role role = requireReadableRole(id);
        String managed = managedCode(role);
        if (!StorePermissionCatalog.MANAGED_CLERK.equals(managed)) {
            throw new BusinessException(40300, "Only the Clerk role permissions can be changed");
        }
        return role;
    }

    private static boolean isManaged(Role role) {
        String code = managedCode(role);
        return StorePermissionCatalog.MANAGED_ADMIN.equals(code)
                || StorePermissionCatalog.MANAGED_MANAGER.equals(code)
                || StorePermissionCatalog.MANAGED_CLERK.equals(code);
    }

    private static String managedCode(Role role) {
        if (role == null || role.getManagedId() == null) return "";
        return role.getManagedId().trim().toUpperCase(Locale.ROOT);
    }

    private void replacePermissions(Long roleId, List<Integer> permissionIds) {
        List<Permission> available = permissionMapper.findAll();
        Set<Integer> allowedIds = new HashSet<>();
        for (Permission permission : available) allowedIds.add(permission.getId());
        if (permissionIds != null && permissionIds.stream().anyMatch(id -> id == null || !allowedIds.contains(id))) {
            throw new BusinessException(40001, "One or more permissions are invalid");
        }
        roleMapper.clearPermissions(roleId);
        if (permissionIds != null) {
            for (Integer permissionId : new HashSet<>(permissionIds)) {
                roleMapper.addPermission(roleId, permissionId);
            }
        }
    }

    public record RoleRequest(String name, List<Integer> permissionIds) {}
}
