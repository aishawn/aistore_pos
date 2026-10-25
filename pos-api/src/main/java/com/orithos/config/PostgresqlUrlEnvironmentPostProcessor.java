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

/** Converts the platform-friendly postgresql:// URL into the JDBC URL Spring expects. */
public final class PostgresqlUrlEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {
    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        String configured = environment.getProperty("POSTGRESQL_URL");
        if (configured == null || configured.isBlank() || configured.startsWith("jdbc:postgresql:")) {
            return;
        }
        if (!configured.startsWith("postgresql://")) {
            throw new IllegalArgumentException("POSTGRESQL_URL must start with postgresql:// or jdbc:postgresql://");
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
        environment.getPropertySources().addFirst(new MapPropertySource(
                "postgresqlUrl", Map.of("POSTGRESQL_JDBC_URL", jdbc)));
    }

    private static String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private static String encode(String value) {
        return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }
}
