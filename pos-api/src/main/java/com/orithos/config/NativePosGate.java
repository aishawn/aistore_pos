package com.orithos.config;

import com.orithos.common.BusinessException;
import com.orithos.common.PosDatabaseIdentity;
import com.orithos.security.CurrentUser;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/** Restricts the new retail ledger to explicitly enabled test or cutover tenants. */
@Component
public final class NativePosGate {
    private final Set<Long> enabledVendorIds;
    private final String expectedDatabase;
    private final String isolationDatabase;
    private final String runtimeEnvironment;
    private final boolean allowSharedDatabase;
    private final JdbcTemplate jdbcTemplate;

    public NativePosGate(
            @Value("${app.native-pos.enabled-vendor-ids:}") String vendorIds,
            @Value("${app.native-pos.expected-database:}") String expectedDatabase,
            @Value("${app.native-pos.isolation-database:}") String isolationDatabase,
            @Value("${RUNTIME_ENVIRONMENT:}") String runtimeEnvironment,
            @Value("${app.native-pos.allow-shared-database:false}") boolean allowSharedDatabase,
            JdbcTemplate jdbcTemplate) {
        this.enabledVendorIds = Arrays.stream(vendorIds == null ? new String[0] : vendorIds.split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .map(Long::parseLong)
                .collect(Collectors.toUnmodifiableSet());
        this.expectedDatabase = normalize(expectedDatabase);
        this.isolationDatabase = normalize(isolationDatabase);
        this.runtimeEnvironment = runtimeEnvironment == null ? "" : runtimeEnvironment.trim();
        this.allowSharedDatabase = allowSharedDatabase;
        this.jdbcTemplate = jdbcTemplate;
    }

    public void requireEnabled() {
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) throw new BusinessException(40100, "Authenticated tenant is required.");
        if (!enabledFor(vendorId) || !databaseAuthorized()) {
            throw new BusinessException(40300, "Native Orithos POS is not enabled for this store.");
        }
    }

    public boolean databaseAuthorized() {
        if (!PosDatabaseIdentity.matchesAuthorizedDatabase(
                expectedDatabase, expectedDatabase, allowSharedDatabase)) {
            return false;
        }
        if ("uat".equalsIgnoreCase(runtimeEnvironment)
                && (isolationDatabase.isEmpty() || !expectedDatabase.equals(isolationDatabase))) {
            return false;
        }
        try {
            String actualDatabase = normalize(jdbcTemplate.queryForObject("select current_database()", String.class));
            return PosDatabaseIdentity.matchesAuthorizedDatabase(
                    actualDatabase, expectedDatabase, allowSharedDatabase);
        } catch (RuntimeException unavailable) {
            return false;
        }
    }

    public boolean enabledFor(Long vendorId) {
        return vendorId != null && enabledVendorIds.contains(vendorId);
    }

    public boolean allowSharedDatabase() {
        return allowSharedDatabase;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }

}
