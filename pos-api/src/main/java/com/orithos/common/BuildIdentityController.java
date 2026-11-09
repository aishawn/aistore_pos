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
import java.util.Set;
import java.util.Locale;

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
    private final JdbcTemplate jdbcTemplate;

    public BuildIdentityController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** Internal BFF preflight; never returns credentials or database names in production. */
    @GetMapping("/api/public/uat-context")
    public ResponseEntity<Map<String, Object>> uatContext() {
        boolean odooIsolated = "uat".equals(environment) && !database.isBlank()
                && database.equals(isolationOdooDatabase) && !"aipos".equals(database);
        boolean posDatabaseVerified = posDatabaseMatchesExpectation();
        boolean posIsolated = "uat".equals(runtimeEnvironment) && posDatabaseVerified
                && !isolationPosDatabase.isBlank() && isolationPosDatabase.equals(expectedPosDatabase)
                && !isSharedDatabaseName(expectedPosDatabase);
        boolean isolated = odooIsolated && posIsolated;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("isolated", isolated);
        result.put("odooDatabaseIsolated", odooIsolated);
        result.put("posDatabaseVerified", posDatabaseVerified);
        result.put("posDatabaseIsolated", posIsolated);
        if (isolated) result.put("commit", version().getBody().get("commit"));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result);
    }

    private boolean posDatabaseMatchesExpectation() {
        if (expectedPosDatabase == null || expectedPosDatabase.isBlank()) return false;
        try {
            String actualDatabase = jdbcTemplate.queryForObject("select current_database()", String.class);
            return expectedPosDatabase.equals(actualDatabase);
        } catch (RuntimeException unavailable) {
            return false;
        }
    }

    private static boolean isSharedDatabaseName(String value) {
        return Set.of("postgres", "aipos", "orithos", "production", "prod")
                .contains(value.trim().toLowerCase(Locale.ROOT));
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
