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
import java.util.stream.Collectors;

/** Immutable metadata written into the image by the remote builder. */
@RestController
public class BuildIdentityController {
    @Value("${RUNTIME_ENVIRONMENT:}")
    private String environment;
    @Value("${ODOO_DATABASE:}")
    private String database;
    @Value("${ISOLATION_ODOO_DATABASE:}")
    private String isolationOdooDatabase;
    @Value("${RUNTIME_ENVIRONMENT:}")
    private String runtimeEnvironment;
    @Value("${app.native-pos.expected-database:}")
    private String expectedPosDatabase;
    @Value("${app.native-pos.isolation-database:}")
    private String isolationPosDatabase;
    @Value("${app.native-pos.enabled-vendor-ids:}")
    private String enabledPosVendorIds;
    private final JdbcTemplate jdbcTemplate;

    public BuildIdentityController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** Internal BFF preflight; never returns credentials or database names in production. */
    @GetMapping("/api/public/uat-context")
    public ResponseEntity<Map<String, Object>> uatContext() {
        boolean odooIsolated = "uat".equals(environment) && !database.isBlank()
                && database.equals(isolationOdooDatabase) && !"aipos".equals(database);
        PosDatabaseIdentity.VerificationStatus posDatabaseStatus = posDatabaseStatus();
        boolean posDatabaseVerified = posDatabaseStatus == PosDatabaseIdentity.VerificationStatus.VERIFIED;
        boolean posTenantIsolated = "uat".equals(runtimeEnvironment) && posDatabaseVerified
                && !isolationPosDatabase.isBlank() && isolationPosDatabase.equals(expectedPosDatabase)
                && enabledPosVendorIds != null
                && Arrays.stream(enabledPosVendorIds.split(","))
                .map(String::trim).filter(value -> !value.isEmpty()).collect(Collectors.toSet()).size() == 1;
        boolean isolated = odooIsolated && posTenantIsolated;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("isolated", isolated);
        result.put("odooDatabaseIsolated", odooIsolated);
        result.put("posDatabaseVerified", posDatabaseVerified);
        result.put("posDatabaseStatus", posDatabaseStatus.name());
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
