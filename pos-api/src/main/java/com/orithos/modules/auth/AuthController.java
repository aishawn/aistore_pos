package com.orithos.modules.auth;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.modules.auth.dto.ChangePasswordRequest;
import com.orithos.modules.auth.dto.ForgotPasswordRequest;
import com.orithos.modules.auth.dto.InviteUserRequest;
import com.orithos.modules.auth.dto.LoginRequest;
import com.orithos.modules.auth.dto.ResetPasswordRequest;
import com.orithos.modules.auth.dto.TokenResponse;
import com.orithos.modules.user.UserService;
import com.orithos.modules.user.entity.User;
import com.orithos.security.AccountTokenStore;
import com.orithos.security.CurrentUser;
import com.orithos.security.JwtProperties;
import com.orithos.security.JwtService;
import com.orithos.security.TokenStore;
import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserService userService;
    private final JwtService jwtService;
    private final TokenStore tokenStore;
    private final JwtProperties props;
    private final AccountLifecycleService accountLifecycle;

    public AuthController(UserService userService, JwtService jwtService,
                          TokenStore tokenStore, JwtProperties props,
                          AccountLifecycleService accountLifecycle) {
        this.userService = userService;
        this.jwtService = jwtService;
        this.tokenStore = tokenStore;
        this.props = props;
        this.accountLifecycle = accountLifecycle;
    }

    @PostMapping("/login")
    public ApiResult<TokenResponse> login(@Valid @RequestBody LoginRequest req) {
        User u = userService.authenticate(req.username(), req.password());
        if (u.getOutletId() == null) {
            throw new BusinessException(40104, "User is not bound to an outlet");
        }
        List<String> authorities = userService.authorities(u);

        var access = jwtService.issueAccess(u.getId(), u.getUsername(),
                Boolean.TRUE.equals(u.getIsAdmin()), u.getOutletId(), authorities);
        var refresh = jwtService.issueRefresh(u.getId(), u.getUsername());
        tokenStore.saveRefresh(u.getId(), refresh.jti(), refresh.expiry());

        var info = new TokenResponse.UserInfo(u.getId(), u.getName(), u.getUsername(),
                Boolean.TRUE.equals(u.getIsAdmin()), u.getOutletId(), u.getEmail(), Boolean.TRUE.equals(u.getPendingPasswordReset()));
        return ApiResult.ok(new TokenResponse(access.token(), refresh.token(),
                props.getAccessTokenTtlMinutes() * 60, info));
    }

    @PostMapping("/refresh")
    public ApiResult<TokenResponse> refresh(@RequestBody Map<String, String> body) {
        String refreshToken = body.get("refreshToken");
        if (refreshToken == null) throw new BusinessException(40102, "Missing refreshToken");
        Claims claims;
        try {
            claims = jwtService.parse(refreshToken);
        } catch (Exception e) {
            throw new BusinessException(40103, "Invalid refresh token");
        }
        Long userId = Long.parseLong(claims.getSubject());
        if (!"refresh".equals(claims.get("type", String.class))
                || !tokenStore.refreshValid(userId, claims.getId())) {
            throw new BusinessException(40103, "Refresh token expired or revoked");
        }
        User u = userService.require(userId);
        if (u.getOutletId() == null) {
            throw new BusinessException(40104, "User is not bound to an outlet");
        }
        List<String> authorities = userService.authorities(u);
        var access = jwtService.issueAccess(u.getId(), u.getUsername(),
                Boolean.TRUE.equals(u.getIsAdmin()), u.getOutletId(), authorities);
        var info = new TokenResponse.UserInfo(u.getId(), u.getName(), u.getUsername(),
                Boolean.TRUE.equals(u.getIsAdmin()), u.getOutletId(), u.getEmail(), Boolean.TRUE.equals(u.getPendingPasswordReset()));
        return ApiResult.ok(new TokenResponse(access.token(), refreshToken,
                props.getAccessTokenTtlMinutes() * 60, info));
    }

    @PostMapping("/logout")
    public ApiResult<Void> logout(@RequestHeader(value = "Authorization", required = false) String header) {
        if (header != null && header.startsWith("Bearer ")) {
            try {
                Claims claims = jwtService.parse(header.substring(7));
                tokenStore.blacklist(claims.getId(), claims.getExpiration());
                tokenStore.revokeRefresh(Long.parseLong(claims.getSubject()));
            } catch (Exception ignored) {
            }
        }
        return ApiResult.ok();
    }

    @PostMapping("/change-password")
    public ApiResult<TokenResponse> changePassword(
            @RequestHeader(value = "Authorization", required = false) String header,
            @Valid @RequestBody ChangePasswordRequest req) {
        Long userId = CurrentUser.id();
        if (userId == null) throw new BusinessException(40100, "Unauthorized");
        userService.changePassword(userId, req.currentPassword(), req.newPassword());
        tokenStore.revokeRefresh(userId);
        if (header != null && header.startsWith("Bearer ")) {
            try {
                Claims current = jwtService.parse(header.substring(7));
                if (userId.equals(Long.parseLong(current.getSubject()))) {
                    tokenStore.blacklist(current.getId(), current.getExpiration());
                }
            } catch (Exception ignored) {
                // The credential change remains successful; a fresh session is issued below.
            }
        }
        User user = userService.require(userId);
        var authorities = userService.authorities(user);
        var access = jwtService.issueAccess(user.getId(), user.getUsername(),
                Boolean.TRUE.equals(user.getIsAdmin()), user.getOutletId(), authorities);
        var refresh = jwtService.issueRefresh(user.getId(), user.getUsername());
        tokenStore.saveRefresh(user.getId(), refresh.jti(), refresh.expiry());
        var info = new TokenResponse.UserInfo(user.getId(), user.getName(), user.getUsername(),
                Boolean.TRUE.equals(user.getIsAdmin()), user.getOutletId(), user.getEmail(), false);
        return ApiResult.ok(new TokenResponse(access.token(), refresh.token(),
                props.getAccessTokenTtlMinutes() * 60, info));
    }

    @PostMapping("/forgot-password")
    public ApiResult<Map<String, Object>> forgotPassword(@Valid @RequestBody ForgotPasswordRequest req) {
        return ApiResult.ok(accountLifecycle.requestPasswordReset(req.identifier()));
    }

    @GetMapping("/reset-token")
    public ApiResult<Map<String, Object>> peekResetToken(
            @RequestParam String token,
            @RequestParam(defaultValue = "reset") String purpose) {
        if (AccountTokenStore.PURPOSE_INVITE.equalsIgnoreCase(purpose)) {
            return ApiResult.ok(accountLifecycle.peekInviteToken(token));
        }
        return ApiResult.ok(accountLifecycle.peekResetToken(token));
    }

    @PostMapping("/reset-password")
    public ApiResult<Map<String, Object>> resetPassword(@Valid @RequestBody ResetPasswordRequest req) {
        if (AccountTokenStore.PURPOSE_INVITE.equalsIgnoreCase(req.purpose())) {
            return ApiResult.ok(accountLifecycle.completeInvite(req.token(), req.newPassword()));
        }
        return ApiResult.ok(accountLifecycle.completePasswordReset(req.token(), req.newPassword()));
    }

    @PostMapping("/invite")
    public ApiResult<Map<String, Object>> invite(@Valid @RequestBody InviteUserRequest req) {
        return ApiResult.ok(accountLifecycle.inviteUser(
                req.name(), req.username(), req.email(), req.roleId(), req.isAdmin(), req.outletId()));
    }

    @PostMapping("/users/{id}/reset-link")
    public ApiResult<Map<String, Object>> issueResetLink(@PathVariable Long id) {
        return ApiResult.ok(accountLifecycle.issueResetLink(id));
    }

    /** Current user info — mirrors the live /user/info shape. */
    @GetMapping("/me")
    public ApiResult<Map<String, Object>> me() {
        Long id = CurrentUser.id();
        if (id == null) throw new BusinessException(40100, "Unauthorized");
        User u = userService.require(id);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", u.getId());
        body.put("name", u.getName());
        body.put("username", u.getUsername());
        body.put("isAdmin", Boolean.TRUE.equals(u.getIsAdmin()));
        body.put("darkMode", u.getDarkMode() == null ? "default" : u.getDarkMode());
        body.put("outletId", u.getOutletId());
        body.put("email", u.getEmail());
        body.put("pendingPasswordReset", Boolean.TRUE.equals(u.getPendingPasswordReset()));
        return ApiResult.ok(body);
    }
}
