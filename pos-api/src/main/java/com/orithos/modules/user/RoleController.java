package com.orithos.modules.user;

import com.orithos.common.ApiResult;
import com.orithos.modules.user.entity.Permission;
import com.orithos.modules.user.entity.Role;
import com.orithos.modules.user.mapper.PermissionMapper;
import com.orithos.modules.user.mapper.RoleMapper;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;

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
        return ApiResult.ok(roleMapper.findAll());
    }

    @GetMapping("/roles/{id}")
    public ApiResult<Role> getRole(@PathVariable Long id) {
        return ApiResult.ok(roleMapper.findById(id));
    }

    @PostMapping("/roles")
    public ApiResult<Role> createRole(@RequestBody Role r) {
        roleMapper.insert(r);
        return ApiResult.ok(r);
    }

    @PutMapping("/roles/{id}")
    public ApiResult<Role> updateRole(@PathVariable Long id, @RequestBody Role r) {
        r.setId(id);
        roleMapper.update(r);
        return ApiResult.ok(r);
    }

    @DeleteMapping("/roles/{id}")
    public ApiResult<Void> deleteRole(@PathVariable Long id) {
        roleMapper.delete(id);
        return ApiResult.ok();
    }

    @PostMapping("/roles/{id}/clone")
    @Transactional
    public ApiResult<Role> cloneRole(@PathVariable Long id) {
        Role src = roleMapper.findById(id);
        if (src == null) return ApiResult.ok(null);
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
        return ApiResult.ok(roleMapper.permissionsOfRole(id));
    }

    @PutMapping("/roles/{id}/permissions")
    public ApiResult<Void> setRolePermissions(@PathVariable Long id, @RequestBody List<Integer> permissionIds) {
        roleMapper.clearPermissions(id);
        if (permissionIds != null) {
            for (Integer permissionId : permissionIds) {
                if (permissionId != null) {
                    roleMapper.addPermission(id, permissionId);
                }
            }
        }
        return ApiResult.ok();
    }

    @GetMapping("/permissions")
    public ApiResult<List<Permission>> listPermissions() {
        return ApiResult.ok(permissionMapper.findAll());
    }
}
