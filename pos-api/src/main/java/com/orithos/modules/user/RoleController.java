package com.orithos.modules.user;

import com.orithos.common.ApiResult;
import com.orithos.modules.user.entity.Permission;
import com.orithos.modules.user.entity.Role;
import com.orithos.modules.user.mapper.PermissionMapper;
import com.orithos.modules.user.mapper.RoleMapper;
import com.orithos.security.AdminAccess;
import com.orithos.common.BusinessException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.HashSet;
import java.util.Set;

@RestController
@RequestMapping("/api")
public class RoleController {

    private final RoleMapper roleMapper;
    private final PermissionMapper permissionMapper;

    public RoleController(RoleMapper roleMapper, PermissionMapper permissionMapper) {
        this.roleMapper = roleMapper;
        this.permissionMapper = permissionMapper;
    }

    @GetMapping("/roles")
    public ApiResult<List<Role>> listRoles() {
        AdminAccess.requireAdmin();
        return ApiResult.ok(roleMapper.findAll());
    }

    @GetMapping("/roles/{id}")
    public ApiResult<Role> getRole(@PathVariable Long id) {
        AdminAccess.requireAdmin();
        return ApiResult.ok(requireRole(id));
    }

    @PostMapping("/roles")
    @Transactional
    public ApiResult<Role> createRole(@RequestBody RoleRequest req) {
        AdminAccess.requireAdmin();
        Role r = new Role();
        r.setName(requireName(req.name()));
        roleMapper.insert(r);
        replacePermissions(r.getId(), req.permissionIds());
        return ApiResult.ok(r);
    }

    @PutMapping("/roles/{id}")
    @Transactional
    public ApiResult<Role> updateRole(@PathVariable Long id, @RequestBody RoleRequest req) {
        AdminAccess.requireAdmin();
        Role r = requireRole(id);
        r.setId(id);
        r.setName(requireName(req.name()));
        roleMapper.update(r);
        if (req.permissionIds() != null) replacePermissions(id, req.permissionIds());
        return ApiResult.ok(r);
    }

    @DeleteMapping("/roles/{id}")
    @Transactional
    public ApiResult<Void> deleteRole(@PathVariable Long id) {
        AdminAccess.requireAdmin();
        requireRole(id);
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
        AdminAccess.requireAdmin();
        Role src = requireRole(id);
        List<Permission> perms = roleMapper.permissionsOfRole(id);
        src.setName(src.getName() + " (copy)");
        src.setManagedId(null);
        roleMapper.insert(src);
        for (Permission p : perms) {
            roleMapper.addPermission(src.getId(), p.getId());
        }
        return ApiResult.ok(src);
    }

    @GetMapping("/roles/{id}/permissions")
    public ApiResult<List<Permission>> rolePermissions(@PathVariable Long id) {
        AdminAccess.requireAdmin();
        requireRole(id);
        return ApiResult.ok(roleMapper.permissionsOfRole(id));
    }

    @PutMapping("/roles/{id}/permissions")
    public ApiResult<Void> setRolePermissions(@PathVariable Long id, @RequestBody List<Integer> permissionIds) {
        AdminAccess.requireAdmin();
        requireRole(id);
        replacePermissions(id, permissionIds);
        return ApiResult.ok();
    }

    @GetMapping("/permissions")
    public ApiResult<List<Permission>> listPermissions() {
        AdminAccess.requireAdmin();
        return ApiResult.ok(permissionMapper.findAll());
    }

    private Role requireRole(Long id) {
        Role role = roleMapper.findById(id);
        if (role == null) throw new BusinessException(40400, "Role not found");
        return role;
    }

    private String requireName(String name) {
        String normalized = name == null ? "" : name.trim();
        if (normalized.isEmpty() || normalized.length() > 80) {
            throw new BusinessException(40001, "Role name must be between 1 and 80 characters");
        }
        return normalized;
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
