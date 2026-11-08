package com.orithos.config;

import com.orithos.common.BusinessException;
import com.orithos.security.CurrentUser;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/** Restricts the new retail ledger to explicitly enabled test or cutover tenants. */
@Component
public final class NativePosGate {
    private final Set<Long> enabledVendorIds;

    public NativePosGate(@Value("${app.native-pos.enabled-vendor-ids:}") String vendorIds) {
        this.enabledVendorIds = Arrays.stream(vendorIds == null ? new String[0] : vendorIds.split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .map(Long::parseLong)
                .collect(Collectors.toUnmodifiableSet());
    }

    public void requireEnabled() {
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) throw new BusinessException(40100, "Authenticated tenant is required.");
        if (!enabledVendorIds.contains(vendorId)) {
            throw new BusinessException(40300, "Native Orithos POS is not enabled for this store.");
        }
    }
}
