package com.orithos.modules.user;

import com.orithos.common.ApiResult;
import com.orithos.modules.user.entity.User;
import com.orithos.security.CurrentUser;
import com.orithos.security.AdminAccess;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public ApiResult<List<User>> list() {
        AdminAccess.requireAdmin();
        return ApiResult.ok(userService.list());
    }

    @GetMapping("/{id}")
    public ApiResult<User> get(@PathVariable Long id) {
        AdminAccess.requireAdmin();
        return ApiResult.ok(userService.require(id));
    }

    @PostMapping
    public ApiResult<User> create(@RequestBody CreateUserRequest req) {
        AdminAccess.requireAdmin();
        User u = new User();
        u.setName(req.name());
        u.setUsername(req.username());
        u.setEmail(req.email());
        u.setRoleId(req.roleId());
        u.setIsAdmin(req.isAdmin());
        u.setVendorId(CurrentUser.vendorId());
        Long outletId = req.outletId() != null ? req.outletId() : CurrentUser.outletId();
        u.setOutletId(outletId);
        return ApiResult.ok(userService.create(u, req.password()));
    }

    @PutMapping("/{id}")
    public ApiResult<User> update(@PathVariable Long id, @RequestBody UpdateUserRequest req) {
        AdminAccess.requireAdmin();
        User patch = new User();
        patch.setName(req.name());
        patch.setEmail(req.email());
        patch.setPhone(req.phone());
        patch.setImage(req.image());
        patch.setRoleId(req.roleId());
        patch.setDarkMode(req.darkMode());
        patch.setPendingPasswordReset(req.pendingPasswordReset());
        return ApiResult.ok(userService.update(id, patch));
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
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

    public record CreateUserRequest(String name, String username, String password,
                                    String email, Long roleId, Boolean isAdmin, Long outletId) {}

    public record DashboardRequest(String dashboard) {}

    public record UpdateUserRequest(String name, String email, String phone, String image,
                                    Long roleId, String darkMode, Boolean pendingPasswordReset) {}
}
