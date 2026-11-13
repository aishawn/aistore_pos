package com.orithos.common;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;

import java.io.IOException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/** Immutable metadata written into the image by the remote builder. */
@RestController
public class BuildIdentityController {
    @Value("${RUNTIME_ENVIRONMENT:}")
    private String environment;
    @Value("${RUNTIME_ENVIRONMENT:}")
    private String runtimeEnvironment;
    @Value("${app.native-pos.expected-database:}")
    private String expectedPosDatabase;
    @Value("${app.native-pos.isolation-database:}")
    private String isolationPosDatabase;
    @Value("${app.native-pos.enabled-vendor-ids:}")
    private String enabledPosVendorIds;
    @Value("${app.native-pos.allow-shared-database:false}")
    private boolean allowSharedPosDatabase;
    private final JdbcTemplate jdbcTemplate;

    public BuildIdentityController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** Internal BFF preflight; never returns credentials or database names in production. */
    @GetMapping("/api/public/uat-context")
    public ResponseEntity<Map<String, Object>> uatContext() {
        PosDatabaseIdentity.VerificationStatus posDatabaseStatus = posDatabaseStatus();
        boolean sharedAuthorized = allowSharedPosDatabase
                && posDatabaseStatus == PosDatabaseIdentity.VerificationStatus.SHARED_DATABASE_NAME;
        boolean posDatabaseVerified = posDatabaseStatus == PosDatabaseIdentity.VerificationStatus.VERIFIED
                || sharedAuthorized;
        // Shared-database cutover can authorize writes, but never claims tenant isolation.
        Set<String> enabledTenants = Arrays.stream(enabledPosVendorIds == null ? new String[0] : enabledPosVendorIds.split(","))
                .map(String::trim).filter(value -> !value.isEmpty()).collect(Collectors.toSet());
        boolean posTenantIsolated = PosDatabaseIdentity.isIsolatedTestEnvironment(runtimeEnvironment)
                && posDatabaseStatus == PosDatabaseIdentity.VerificationStatus.VERIFIED
                && !isolationPosDatabase.isBlank() && isolationPosDatabase.equals(expectedPosDatabase)
                && !enabledTenants.isEmpty();
        boolean isolated = PosDatabaseIdentity.isIsolatedTestEnvironment(environment) && posTenantIsolated;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("isolated", isolated);
        result.put("posDatabaseVerified", posDatabaseVerified);
        result.put("posDatabaseStatus", posDatabaseStatus.name());
        result.put("posSharedDatabaseAuthorized", sharedAuthorized);
        result.put("posTenantIsolated", posTenantIsolated);
        if (isolated) result.put("commit", version().getBody().get("commit"));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result);
    }

    private PosDatabaseIdentity.VerificationStatus posDatabaseStatus() {
        if (expectedPosDatabase == null || expectedPosDatabase.isBlank()) {
            return PosDatabaseIdentity.VerificationStatus.EXPECTED_DATABASE_UNSET;
        }
        try {
            String actualDatabase = jdbcTemplate.queryForObject("select current_database()", String.class);
            return PosDatabaseIdentity.verify(actualDatabase, expectedPosDatabase);
        } catch (RuntimeException unavailable) {
            return PosDatabaseIdentity.VerificationStatus.ACTUAL_DATABASE_UNAVAILABLE;
        }
    }

    @GetMapping("/api/public/version")
    public ResponseEntity<Map<String, Object>> version() {
        Properties properties = new Properties();
        try (var resource = getClass().getResourceAsStream("/build-identity.properties")) {
            if (resource != null) properties.load(resource);
        } catch (IOException ignored) { /* Missing identity remains explicitly unknown. */ }
        String commit = properties.getProperty("commit", "");
        String builtAt = properties.getProperty("builtAt", "");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("service", "orithos-backend");
        result.put("commit", commit.matches("[a-f0-9]{40}") ? commit : null);
        try {
            result.put("builtAt", Instant.parse(builtAt).toString());
        } catch (java.time.format.DateTimeParseException ignored) {
            result.put("builtAt", null);
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result);
    }
}
