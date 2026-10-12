package com.orithos.modules.ai.report;

import com.orithos.common.BusinessException;
import com.orithos.security.AuthUser;
import com.orithos.security.CurrentUser;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Component
public class TenantContextFactory {

    private final UserReportingOutletMapper reportingOutletMapper;

    public TenantContextFactory(UserReportingOutletMapper reportingOutletMapper) {
        this.reportingOutletMapper = reportingOutletMapper;
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

        Set<String> authorities = Set.of();
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null) {
            authorities = auth.getAuthorities().stream()
                    .map(GrantedAuthority::getAuthority)
                    .collect(Collectors.toUnmodifiableSet());
        }

        return new TenantContext(
                TenantContext.DEFAULT_VENDOR_ID,
                user.id(),
                user.outletId(),
                List.copyOf(new ArrayList<>(outlets)),
                authorities
        );
    }
}
