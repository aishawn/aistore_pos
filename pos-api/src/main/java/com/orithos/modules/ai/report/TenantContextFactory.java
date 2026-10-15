package com.orithos.modules.ai.report;

import com.orithos.common.BusinessException;
import com.orithos.modules.user.UserService;
import com.orithos.security.AuthUser;
import com.orithos.security.CurrentUser;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Component
public class TenantContextFactory {

    private final UserReportingOutletMapper reportingOutletMapper;
    private final UserService userService;

    public TenantContextFactory(UserReportingOutletMapper reportingOutletMapper, UserService userService) {
        this.reportingOutletMapper = reportingOutletMapper;
        this.userService = userService;
    }

    public TenantContext fromSecurity() {
        AuthUser user = CurrentUser.get();
        if (user == null || user.id() == null) {
            throw new BusinessException(40100, "Unauthorized");
        }

        LinkedHashSet<Long> outlets = new LinkedHashSet<>();
        if (user.outletId() != null) {
            outlets.add(user.outletId());
        }
        try {
            List<Long> extra = reportingOutletMapper.findOutletIds(user.id());
            if (extra != null) {
                extra.stream().filter(id -> id != null).forEach(outlets::add);
            }
        } catch (Exception ignored) {
            // table may be empty / missing on partial installs
        }

        // Role permissions can change while an access token is still valid. Resolve them
        // from the active user record so revocations take effect on the next report request.
        Set<String> authorities = Set.copyOf(userService.authoritiesForActiveUser(user.id()));

        long vendorId = user.vendorId() != null ? user.vendorId() : TenantContext.DEFAULT_VENDOR_ID;
        return new TenantContext(
                vendorId,
                user.id(),
                user.outletId(),
                List.copyOf(new ArrayList<>(outlets)),
                authorities
        );
    }
}
