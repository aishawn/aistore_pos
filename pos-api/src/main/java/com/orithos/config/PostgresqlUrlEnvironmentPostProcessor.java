package com.orithos.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.LinkedHashMap;

/** Converts the platform-friendly postgresql:// URL into the JDBC URL Spring expects. */
public final class PostgresqlUrlEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {
    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        Map<String, Object> jdbcUrls = new LinkedHashMap<>();
        normalize(environment.getProperty("POSTGRESQL_URL"), "POSTGRESQL_JDBC_URL", "POSTGRESQL_URL", jdbcUrls);
        normalize(environment.getProperty("CONTROL_POSTGRESQL_URL"), "CONTROL_POSTGRESQL_JDBC_URL",
                "CONTROL_POSTGRESQL_URL", jdbcUrls);
        if (jdbcUrls.isEmpty()) return;
        environment.getPropertySources().addFirst(new MapPropertySource("postgresqlUrl", jdbcUrls));
    }

    private static void normalize(String configured, String propertyName, String variableName,
                                  Map<String, Object> jdbcUrls) {
        if (configured == null || configured.isBlank()) return;
        if (configured.startsWith("jdbc:postgresql:")) {
            jdbcUrls.put(propertyName, configured);
            return;
        }
        if (!configured.startsWith("postgresql://")) {
            throw new IllegalArgumentException(variableName + " must start with postgresql:// or jdbc:postgresql://");
        }
        URI uri = URI.create(configured);
        String userInfo = uri.getRawUserInfo();
        String authority = uri.getHost() + (uri.getPort() > 0 ? ":" + uri.getPort() : "");
        String query = uri.getRawQuery();
        if (userInfo != null && !userInfo.isBlank()) {
            String[] credentials = userInfo.split(":", 2);
            String auth = "user=" + encode(decode(credentials[0]));
            if (credentials.length == 2) {
                auth += "&password=" + encode(decode(credentials[1]));
            }
            query = query == null || query.isBlank() ? auth : auth + "&" + query;
        }
        String jdbc = "jdbc:postgresql://" + authority + uri.getRawPath()
                + (query == null || query.isBlank() ? "" : "?" + query);
        jdbcUrls.put(propertyName, jdbc);
    }

    private static String decode(String value) {
        // URI user-info is not form data: a literal '+' must remain a plus.
        return URLDecoder.decode(value.replace("+", "%2B"), StandardCharsets.UTF_8);
    }

    private static String encode(String value) {
        return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }
}
