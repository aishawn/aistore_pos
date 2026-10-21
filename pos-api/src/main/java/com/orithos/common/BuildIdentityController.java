package com.orithos.common;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.beans.factory.annotation.Value;

import java.io.IOException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;

/** Immutable metadata written into the image by the remote builder. */
@RestController
public class BuildIdentityController {
    @Value("${RUNTIME_ENVIRONMENT:}")
    private String environment;
    @Value("${ODOO_DATABASE:}")
    private String database;
    @Value("${ISOLATION_ODOO_DATABASE:}")
    private String isolationDatabase;

    /** Internal BFF preflight; never returns credentials or database names in production. */
    @GetMapping("/api/public/uat-context")
    public ResponseEntity<Map<String, Object>> uatContext() {
        boolean isolated = "uat".equals(environment) && !database.isBlank()
                && database.equals(isolationDatabase) && !"aipos".equals(database);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("isolated", isolated);
        if (isolated) {
            result.put("database", database);
            result.put("commit", version().getBody().get("commit"));
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result);
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
