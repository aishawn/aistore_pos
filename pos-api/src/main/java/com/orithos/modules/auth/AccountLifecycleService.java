package com.orithos.modules.auth;

import com.orithos.common.BusinessException;
import com.orithos.modules.user.UserService;
import com.orithos.modules.user.entity.User;
import com.orithos.modules.user.mapper.UserMapper;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import com.orithos.security.AccountTokenStore;
import com.orithos.security.AuthUser;
import com.orithos.security.CurrentUser;
import com.orithos.security.TokenStore;
import com.orithos.tenant.TenantProperties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AccountLifecycleService {

    private static final Duration RESET_TTL = Duration.ofHours(2);
    private static final Duration INVITE_TTL = Duration.ofDays(7);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserMapper userMapper;
    private final UserService userService;
    private final AccountTokenStore accountTokens;
    private final TokenStore tokenStore;
    private final MailService mailService;
    private final VendorMapper vendorMapper;
    private final TenantProperties tenantProperties;
    private final String publicAppUrl;

    public AccountLifecycleService(
            UserMapper userMapper,
            UserService userService,
            AccountTokenStore accountTokens,
            TokenStore tokenStore,
            MailService mailService,
            VendorMapper vendorMapper,
            TenantProperties tenantProperties,
            @Value("${app.public-url:http://localhost:3000}") String publicAppUrl) {
        this.userMapper = userMapper;
        this.userService = userService;
        this.accountTokens = accountTokens;
        this.tokenStore = tokenStore;
        this.mailService = mailService;
        this.vendorMapper = vendorMapper;
        this.tenantProperties = tenantProperties;
        this.publicAppUrl = publicAppUrl.replaceAll("/+$", "");
    }

    /** Anti-enumeration: always succeed. Sends mail when SMTP + user email are available. */
    public Map<String, Object> requestPasswordReset(String identifier) {
        String id = identifier == null ? "" : identifier.trim();
        if (!id.isBlank()) {
            User user = findByUsernameOrEmail(id);
            if (user != null && user.getOutletId() != null) {
                String token = accountTokens.issue(user.getId(), AccountTokenStore.PURPOSE_RESET, RESET_TTL);
                String url = resetUrl(token);
                if (user.getEmail() != null && !user.getEmail().isBlank()) {
                    mailService.send(
                            user.getEmail(),
                            "Reset your Orithos password",
                            "Hi " + displayName(user) + ",\n\n"
                                    + "Use this link to choose a new password (expires in 2 hours):\n"
                                    + url + "\n\n"
                                    + "If you did not request this, you can ignore this email.\n");
                }
            }
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", "If an account matches those details, password reset instructions have been sent.");
        body.put("mailConfigured", mailService.isConfigured());
        return body;
    }

    public void revokeAndDeleteVendorAccounts(Long vendorId) {
        List<User> users = userMapper.findAllByVendor(vendorId);
        for (User user : users) {
            tokenStore.revokeRefresh(user.getId());
            accountTokens.revokeForUser(user.getId(), AccountTokenStore.PURPOSE_BOOTSTRAP);
            accountTokens.revokeForUser(user.getId(), AccountTokenStore.PURPOSE_RESET);
            accountTokens.revokeForUser(user.getId(), AccountTokenStore.PURPOSE_INVITE);
            userMapper.softDelete(user.getId());
        }
    }

    public Map<String, Object> peekResetToken(String token) {
        return peekToken(token, AccountTokenStore.PURPOSE_RESET);
    }

    public Map<String, Object> peekInviteToken(String token) {
        return peekToken(token, AccountTokenStore.PURPOSE_INVITE);
    }

    public Map<String, Object> completePasswordReset(String token, String newPassword) {
        return completeToken(token, AccountTokenStore.PURPOSE_RESET, newPassword);
    }

    public Map<String, Object> completeInvite(String token, String newPassword) {
        return completeToken(token, AccountTokenStore.PURPOSE_INVITE, newPassword);
    }

    public Map<String, Object> inviteUser(String name, String username, String email,
                                          Long roleId, Boolean isAdmin, Long outletId) {
        requireAdmin();
        if (email == null || email.isBlank()) {
            throw new BusinessException(40001, "Email is required so the invite can be delivered");
        }
        User u = new User();
        u.setName(name == null || name.isBlank() ? username : name.trim());
        u.setUsername(username.trim());
        u.setEmail(email.trim());
        u.setRoleId(roleId);
        u.setIsAdmin(Boolean.TRUE.equals(isAdmin));
        Long resolvedOutlet = outletId != null ? outletId : CurrentUser.outletId();
        u.setOutletId(resolvedOutlet);
        u.setVendorId(CurrentUser.vendorId() != null ? CurrentUser.vendorId() : 1L);
        u.setPendingPasswordReset(true);
        // Random placeholder until the invitee sets a real password.
        User created = userService.create(u, randomPassword());

        String token = accountTokens.issue(created.getId(), AccountTokenStore.PURPOSE_INVITE, INVITE_TTL);
        String url = inviteUrl(token);
        boolean emailSent = mailService.send(
                created.getEmail(),
                "You're invited to Orithos",
                "Hi " + displayName(created) + ",\n\n"
                        + "You've been invited to the Orithos store workspace.\n"
                        + "Set your password using this link (expires in 7 days):\n"
                        + url + "\n\n"
                        + "Username: " + created.getUsername() + "\n");

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("user", publicUser(created));
        body.put("inviteUrl", url);
        body.put("emailSent", emailSent);
        body.put("mailConfigured", mailService.isConfigured());
        return body;
    }

    public Map<String, Object> issueResetLink(Long userId) {
        requireAdmin();
        User user = userService.require(userId);
        if (user.getOutletId() == null) {
            throw new BusinessException(40104, "User is not bound to an outlet");
        }
        String token = accountTokens.issue(user.getId(), AccountTokenStore.PURPOSE_RESET, RESET_TTL);
        String url = resetUrl(token);
        boolean emailSent = false;
        if (user.getEmail() != null && !user.getEmail().isBlank()) {
            emailSent = mailService.send(
                    user.getEmail(),
                    "Reset your Orithos password",
                    "Hi " + displayName(user) + ",\n\n"
                            + "Your store administrator started a password reset.\n"
                            + "Choose a new password here (expires in 2 hours):\n"
                            + url + "\n");
        }
        user.setPendingPasswordReset(true);
        userService.update(user.getId(), user);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("user", publicUser(user));
        body.put("resetUrl", url);
        body.put("emailSent", emailSent);
        body.put("mailConfigured", mailService.isConfigured());
        return body;
    }

    /**
     * Platform-scoped owner reset: does not require CurrentUser.vendorId match.
     * Reset URL uses the tenant store origin so cookies land on {slug}.*
     */
    public Map<String, Object> issueOwnerResetForVendor(Long vendorId) {
        Vendor vendor = vendorMapper.findById(vendorId);
        if (vendor == null) throw new BusinessException(40410, "Store not found");
        User owner = userMapper.findPrimaryByVendor(vendorId);
        if (owner == null) throw new BusinessException(40410, "Store owner not found");
        String token = accountTokens.issue(owner.getId(), AccountTokenStore.PURPOSE_RESET, RESET_TTL);
        String url = storeOriginUrl(vendor, "/reset-password?token=" + token + "&purpose=reset");
        boolean emailSent = false;
        if (owner.getEmail() != null && !owner.getEmail().isBlank()) {
            emailSent = mailService.send(
                    owner.getEmail(),
                    "Reset your Orithos password",
                    "Hi " + displayName(owner) + ",\n\n"
                            + "A platform administrator started a password reset for your store.\n"
                            + "Choose a new password here (expires in 2 hours):\n"
                            + url + "\n");
        }
        owner.setPendingPasswordReset(true);
        // Platform admin acts across vendors — must not go through UserService.update/require.
        userService.markPendingPasswordReset(owner.getId(), true);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("resetUrl", url);
        body.put("emailSent", emailSent);
        body.put("mailConfigured", mailService.isConfigured());
        body.put("owner", publicUser(owner));
        body.put("redirectHost", tenantProperties.storeUrl(vendor.getSubdomain()));
        return body;
    }

    /** Issue a one-time store-host bootstrap token without changing the owner's password. */
    public Map<String, Object> issueOwnerBootstrapForVendor(Long vendorId) {
        Vendor vendor = vendorMapper.findById(vendorId);
        if (vendor == null) throw new BusinessException(40410, "Store not found");
        User owner = userMapper.findPrimaryByVendor(vendorId);
        if (owner == null) throw new BusinessException(40410, "Store owner not found");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("redirectHost", tenantProperties.storeUrl(vendor.getSubdomain()));
        body.put("bootstrapToken", accountTokens.issue(
                owner.getId(), AccountTokenStore.PURPOSE_BOOTSTRAP, Duration.ofMinutes(5)));
        body.put("owner", publicUser(owner));
        return body;
    }

    /** Prefer reset for owners who already set a password; invite token if still pending. */
    public Map<String, Object> reinviteOwnerForVendor(Long vendorId) {
        Vendor vendor = vendorMapper.findById(vendorId);
        if (vendor == null) throw new BusinessException(40410, "Store not found");
        User owner = userMapper.findPrimaryByVendor(vendorId);
        if (owner == null) throw new BusinessException(40410, "Store owner not found");
        if (Boolean.TRUE.equals(owner.getPendingPasswordReset())) {
            String token = accountTokens.issue(owner.getId(), AccountTokenStore.PURPOSE_INVITE, INVITE_TTL);
            String url = storeOriginUrl(vendor, "/reset-password?token=" + token + "&purpose=invite");
            boolean emailSent = false;
            if (owner.getEmail() != null && !owner.getEmail().isBlank()) {
                emailSent = mailService.send(
                        owner.getEmail(),
                        "You're invited to Orithos",
                        "Hi " + displayName(owner) + ",\n\n"
                                + "Set your password using this link (expires in 7 days):\n"
                                + url + "\n\n"
                                + "Username: " + owner.getUsername() + "\n");
            }
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("inviteUrl", url);
            body.put("emailSent", emailSent);
            body.put("mailConfigured", mailService.isConfigured());
            body.put("owner", publicUser(owner));
            body.put("redirectHost", tenantProperties.storeUrl(vendor.getSubdomain()));
            return body;
        }
        return issueOwnerResetForVendor(vendorId);
    }

    private String storeOriginUrl(Vendor vendor, String pathAndQuery) {
        String base = tenantProperties.storeUrl(vendor.getSubdomain());
        if (base == null || base.isBlank()) {
            base = publicAppUrl;
        }
        return base.replaceAll("/+$", "") + pathAndQuery;
    }

    private Map<String, Object> peekToken(String token, String purpose) {
        Long userId = accountTokens.peek(token, purpose);
        if (userId == null) throw new BusinessException(40106, "This link is invalid or has expired");
        User user = userService.require(userId);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("username", user.getUsername());
        body.put("name", user.getName());
        body.put("purpose", purpose);
        return body;
    }

    private Map<String, Object> completeToken(String token, String purpose, String newPassword) {
        validateNewPassword(newPassword);
        Long userId = accountTokens.consume(token, purpose);
        if (userId == null) throw new BusinessException(40106, "This link is invalid or has expired");
        userService.setPassword(userId, newPassword);
        tokenStore.revokeRefresh(userId);
        accountTokens.revokeForUser(userId, AccountTokenStore.PURPOSE_RESET);
        accountTokens.revokeForUser(userId, AccountTokenStore.PURPOSE_INVITE);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", "Password updated. You can sign in with your new password.");
        return body;
    }

    private User findByUsernameOrEmail(String identifier) {
        User byUsername = userMapper.findByUsername(identifier);
        if (byUsername != null) return byUsername;
        return userMapper.findByEmail(identifier);
    }

    private void requireAdmin() {
        AuthUser current = CurrentUser.get();
        if (current == null) throw new BusinessException(40100, "Unauthorized");
        if (!current.admin()) throw new BusinessException(40300, "Administrator access required");
    }

    private void validateNewPassword(String newPassword) {
        if (newPassword == null || newPassword.length() < 8) {
            throw new BusinessException(40001, "New password must be at least 8 characters");
        }
        if (newPassword.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new BusinessException(40001, "New password must be no more than 72 UTF-8 bytes");
        }
    }

    private String resetUrl(String token) {
        return publicAppUrl + "/reset-password?token=" + token + "&purpose=reset";
    }

    private String inviteUrl(String token) {
        return publicAppUrl + "/reset-password?token=" + token + "&purpose=invite";
    }

    private static String displayName(User user) {
        if (user.getName() != null && !user.getName().isBlank()) return user.getName();
        return user.getUsername();
    }

    private static String randomPassword() {
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    private static Map<String, Object> publicUser(User user) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", user.getId());
        body.put("name", user.getName());
        body.put("username", user.getUsername());
        body.put("email", user.getEmail());
        body.put("isAdmin", Boolean.TRUE.equals(user.getIsAdmin()));
        body.put("outletId", user.getOutletId());
        body.put("pendingPasswordReset", Boolean.TRUE.equals(user.getPendingPasswordReset()));
        return body;
    }
}
