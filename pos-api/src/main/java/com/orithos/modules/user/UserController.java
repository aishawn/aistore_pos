package com.orithos.modules.user;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.modules.user.entity.Role;
import com.orithos.modules.user.entity.User;
import com.orithos.modules.user.mapper.RoleMapper;
import com.orithos.security.AdminAccess;
import com.orithos.security.AuthUser;
import com.orithos.security.CurrentUser;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;
    private final RoleMapper roleMapper;
    private final PermissionAccess permissionAccess;

    public UserController(UserService userService, RoleMapper roleMapper, PermissionAccess permissionAccess) {
        this.userService = userService;
        this.roleMapper = roleMapper;
        this.permissionAccess = permissionAccess;
    }

    @GetMapping
    public ApiResult<List<User>> list() {
        permissionAccess.requireUsersManager();
        List<User> users = userService.list();
        AuthUser actor = CurrentUser.get();
        if (actor != null && !actor.admin()) {
            Role clerk = roleMapper.findByManagedId(StorePermissionCatalog.MANAGED_CLERK);
            Long clerkId = clerk == null ? null : clerk.getId();
            users = users.stream()
                    .filter(u -> !Boolean.TRUE.equals(u.getIsAdmin()))
                    .filter(u -> clerkId != null && clerkId.equals(u.getRoleId()))
                    .collect(Collectors.toList());
        }
        return ApiResult.ok(users);
    }

    @GetMapping("/{id}")
    public ApiResult<User> get(@PathVariable Long id) {
        permissionAccess.requireUsersManager();
        User user = userService.require(id);
        assertCanManageUser(user);
        return ApiResult.ok(user);
    }

    @PostMapping
    public ApiResult<User> create(@RequestBody CreateUserRequest req) {
        permissionAccess.requireUsersManager();
        AuthUser actor = CurrentUser.get();
        boolean actorAdmin = actor != null && actor.admin();
        if (Boolean.TRUE.equals(req.isAdmin()) && !actorAdmin) {
            throw new BusinessException(40300, "Only store administrators can grant administrator access");
        }
        Long roleId = req.roleId();
        Boolean isAdmin = req.isAdmin();
        if (!actorAdmin) {
            Role clerk = roleMapper.findByManagedId(StorePermissionCatalog.MANAGED_CLERK);
            if (clerk == null) throw new BusinessException(50001, "Clerk role is not configured");
            roleId = clerk.getId();
            isAdmin = false;
        }
        User u = new User();
        u.setName(req.name());
        u.setUsername(req.username());
        u.setEmail(req.email());
        u.setRoleId(roleId);
        u.setIsAdmin(Boolean.TRUE.equals(isAdmin));
        u.setVendorId(CurrentUser.vendorId());
        Long outletId = req.outletId() != null ? req.outletId() : CurrentUser.outletId();
        u.setOutletId(outletId);
        return ApiResult.ok(userService.create(u, req.password()));
    }

    @PutMapping("/{id}")
    public ApiResult<User> update(@PathVariable Long id, @RequestBody UpdateUserRequest req) {
        permissionAccess.requireUsersManager();
        User existing = userService.require(id);
        assertCanManageUser(existing);
        Long roleId = req.roleId();
        AuthUser actor = CurrentUser.get();
        if (actor != null && !actor.admin() && roleId != null) {
            Role clerk = roleMapper.findByManagedId(StorePermissionCatalog.MANAGED_CLERK);
            if (clerk == null || !clerk.getId().equals(roleId)) {
                throw new BusinessException(40300, "Store managers can only assign the Clerk role");
            }
        }
        User patch = new User();
        patch.setName(req.name());
        patch.setEmail(req.email());
        patch.setPhone(req.phone());
        patch.setImage(req.image());
        patch.setRoleId(roleId);
        patch.setDarkMode(req.darkMode());
        patch.setPendingPasswordReset(req.pendingPasswordReset());
        return ApiResult.ok(userService.update(id, patch));
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        permissionAccess.requireUsersManager();
        User existing = userService.require(id);
        assertCanManageUser(existing);
        if (CurrentUser.get() != null && !CurrentUser.get().admin()) {
            // Managers may soft-delete clerks only (already asserted).
            userService.delete(id);
            return ApiResult.ok();
        }
        AdminAccess.requireAdmin();
        userService.delete(id);
        return ApiResult.ok();
    }

    @PutMapping("/{id}/dashboard")
    public ApiResult<Void> updateDashboard(@PathVariable Long id, @RequestBody DashboardRequest req) {
        AdminAccess.requireAdmin();
        userService.updateDashboard(id, req.dashboard());
        return ApiResult.ok();
    }

    private void assertCanManageUser(User target) {
        AuthUser actor = CurrentUser.get();
        if (actor == null) throw new BusinessException(40100, "Unauthorized");
        if (actor.admin()) return;
        if (Boolean.TRUE.equals(target.getIsAdmin())) {
            throw new BusinessException(40300, "Store managers cannot manage administrator accounts");
        }
        Role clerk = roleMapper.findByManagedId(StorePermissionCatalog.MANAGED_CLERK);
        if (clerk == null || target.getRoleId() == null || !clerk.getId().equals(target.getRoleId())) {
            throw new BusinessException(40300, "Store managers can only manage Clerk staff");
        }
    }

    public record CreateUserRequest(String name, String username, String password,
                                    String email, Long roleId, Boolean isAdmin, Long outletId) {}

    public record DashboardRequest(String dashboard) {}

    public record UpdateUserRequest(String name, String email, String phone, String image,
                                    Long roleId, String darkMode, Boolean pendingPasswordReset) {}
}
