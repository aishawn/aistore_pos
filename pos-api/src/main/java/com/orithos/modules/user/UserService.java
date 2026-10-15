package com.orithos.modules.user;

import com.orithos.common.BusinessException;
import com.orithos.modules.user.entity.Permission;
import com.orithos.modules.user.entity.Role;
import com.orithos.modules.user.entity.User;
import com.orithos.modules.user.mapper.RoleMapper;
import com.orithos.modules.user.mapper.UserMapper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.nio.charset.StandardCharsets;

@Service
public class UserService {

    private final UserMapper userMapper;
    private final RoleMapper roleMapper;
    private final PasswordEncoder encoder;

    public UserService(UserMapper userMapper, RoleMapper roleMapper, PasswordEncoder encoder) {
        this.userMapper = userMapper;
        this.roleMapper = roleMapper;
        this.encoder = encoder;
    }

    public User authenticate(String username, String rawPassword) {
        User u = userMapper.findByUsername(username);
        if (u == null || !encoder.matches(rawPassword, u.getPasswordHash())) {
            throw new BusinessException(40101, "Invalid username or password");
        }
        return u;
    }

    public User authenticate(Long vendorId, String username, String rawPassword) {
        if (vendorId == null) {
            throw new BusinessException(40101, "Invalid username or password");
        }
        User u = userMapper.findByVendorAndUsername(vendorId, username);
        if (u == null || !encoder.matches(rawPassword, u.getPasswordHash())) {
            throw new BusinessException(40101, "Invalid username or password");
        }
        return u;
    }

    public void changePassword(Long userId, String currentPassword, String newPassword) {
        User user = require(userId);
        if (!encoder.matches(currentPassword, user.getPasswordHash())) {
            throw new BusinessException(40105, "Current password is incorrect");
        }
        if (currentPassword.equals(newPassword)) {
            throw new BusinessException(40001, "New password must be different from the current password");
        }
        setPassword(userId, newPassword);
    }

    /** Set a new password (invite / reset flows). Clears pendingPasswordReset. */
    public void setPassword(Long userId, String newPassword) {
        if (newPassword == null || newPassword.length() < 12) {
            throw new BusinessException(40001, "New password must be at least 12 characters");
        }
        if (newPassword.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new BusinessException(40001, "New password must be no more than 72 UTF-8 bytes");
        }
        if (userMapper.updatePassword(userId, encoder.encode(newPassword)) != 1) {
            throw new BusinessException(40400, "User not found");
        }
    }

    public User require(Long id) {
        User u = userMapper.findById(id);
        if (u == null) throw new BusinessException(40400, "User not found");
        return u;
    }

    /** Resolve report permissions from the active database record, not an older access-token claim. */
    public List<String> authoritiesForActiveUser(Long id) {
        User user = userMapper.findActiveById(id);
        if (user == null) throw new BusinessException(40100, "Unauthorized");
        return authorities(user);
    }

    /** Authorities = ROLE_<roleName> + perm:<safeName> for the JWT claim. */
    public List<String> authorities(User u) {
        List<String> result = new ArrayList<>();
        if (Boolean.TRUE.equals(u.getIsAdmin())) {
            result.add("ROLE_ADMIN");
            result.add("perm:ai.report.query");
            result.add("perm:ai.report.cost");
        }
        if (u.getRoleId() != null) {
            Role role = roleMapper.findById(u.getRoleId());
            if (role != null) {
                result.add("ROLE_" + role.getName().toUpperCase().replace(' ', '_'));
                for (Permission p : roleMapper.permissionsOfRole(role.getId())) {
                    result.add("perm:" + p.getSafeName());
                }
            }
        }
        return result;
    }

    public List<User> list() {
        return userMapper.findAll();
    }

    public User create(User u, String rawPassword) {
        Long vendorId = u.getVendorId() != null ? u.getVendorId() : 1L;
        if (userMapper.findByVendorAndUsername(vendorId, u.getUsername()) != null) {
            throw new BusinessException(40901, "Username already exists");
        }
        u.setVendorId(vendorId);
        u.setPasswordHash(encoder.encode(rawPassword));
        if (u.getDarkMode() == null) u.setDarkMode("default");
        if (u.getIsAdmin() == null) u.setIsAdmin(false);
        if (u.getIsApiUser() == null) u.setIsApiUser(false);
        if (u.getPendingPasswordReset() == null) u.setPendingPasswordReset(false);
        if (u.getOutletId() == null) u.setOutletId(1L);
        userMapper.insert(u);
        return u;
    }

    public User update(Long id, User patch) {
        User existing = require(id);
        existing.setName(patch.getName());
        existing.setEmail(patch.getEmail());
        existing.setPhone(patch.getPhone());
        existing.setImage(patch.getImage());
        existing.setRoleId(patch.getRoleId());
        if (patch.getDarkMode() != null) existing.setDarkMode(patch.getDarkMode());
        if (patch.getPendingPasswordReset() != null) {
            existing.setPendingPasswordReset(patch.getPendingPasswordReset());
        }
        userMapper.update(existing);
        return existing;
    }

    public void delete(Long id) {
        userMapper.softDelete(id);
    }

    public void updateDashboard(Long id, String dashboard) {
        userMapper.updateDashboard(id, dashboard);
    }
}
