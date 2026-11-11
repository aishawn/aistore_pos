package com.orithos.config;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

@Configuration
@ConditionalOnProperty(name = "app.sharding.enabled", havingValue = "true")
public class ShardRoutingConfiguration {

    static final String CONTROL_ROUTE = "__control__";
    private static final Pattern SHARD_KEY = Pattern.compile("^[a-z][a-z0-9_]{0,62}$");

    @Bean(name = "controlDataSource", destroyMethod = "close")
    HikariDataSource controlDataSource(DataSourceProperties properties,
                                       Environment environment,
                                       @Value("${app.sharding.max-control-pool-size:10}") int maxPoolSize) {
        String url = environment.getProperty("app.sharding.control-database-url");
        if (url == null || url.isBlank()) {
            url = properties.determineUrl();
        }
        return createPool("pos-control", url,
                environment.getProperty("app.sharding.username", properties.determineUsername()),
                environment.getProperty("app.sharding.password", properties.determinePassword()),
                maxPoolSize);
    }

    @Bean(name = "dataSource", destroyMethod = "close")
    @Primary
    ShardRoutingDataSource dataSource(@Qualifier("controlDataSource") HikariDataSource controlDataSource,
                                      Environment environment,
                                      ObjectMapper objectMapper,
                                      @Value("${app.sharding.max-pool-size-per-shard:5}") int maxPoolSize,
                                      @Value("${app.sharding.max-shards-per-instance:8}") int maxShards) {
        String configured = environment.getProperty("app.sharding.database-urls", "").trim();
        if (configured.isEmpty()) {
            throw new IllegalStateException("SHARD_DATABASE_URLS must define at least one business shard");
        }
        if (maxPoolSize < 1 || maxPoolSize > 50) {
            throw new IllegalStateException("Per-shard connection pool size must be between 1 and 50");
        }

        Map<String, String> urls;
        try {
            urls = objectMapper.readValue(configured, new TypeReference<>() {});
        } catch (Exception ex) {
            throw new IllegalStateException("SHARD_DATABASE_URLS must be a JSON object of shard keys to JDBC URLs", ex);
        }
        if (urls == null || urls.isEmpty()) {
            throw new IllegalStateException("SHARD_DATABASE_URLS must define at least one business shard");
        }
        if (maxShards < 1 || urls.size() > maxShards) {
            throw new IllegalStateException("Configured shard count exceeds APP_DB_MAX_SHARDS_PER_INSTANCE");
        }

        String username = environment.getProperty("app.sharding.username", "");
        String password = environment.getProperty("app.sharding.password", "");
        Map<String, HikariDataSource> shardPools = new LinkedHashMap<>();
        urls.forEach((key, url) -> {
            if (key == null || !SHARD_KEY.matcher(key).matches()) {
                throw new IllegalStateException("Invalid shard key in SHARD_DATABASE_URLS");
            }
            if (url == null || !url.startsWith("jdbc:postgresql://")) {
                throw new IllegalStateException("Each shard URL must start with jdbc:postgresql://");
            }
            if (shardPools.putIfAbsent(key, createPool("pos-" + key, url, username, password, maxPoolSize)) != null) {
                throw new IllegalStateException("Duplicate shard key in SHARD_DATABASE_URLS");
            }
        });

        ShardRoutingDataSource routing = new ShardRoutingDataSource(shardPools);
        Map<Object, Object> targets = new LinkedHashMap<>();
        targets.put(CONTROL_ROUTE, controlDataSource);
        targets.putAll(shardPools);
        routing.setTargetDataSources(targets);
        routing.setDefaultTargetDataSource(controlDataSource);
        routing.setLenientFallback(false);
        routing.afterPropertiesSet();
        return routing;
    }

    @Bean(name = "controlJdbcTemplate")
    JdbcTemplate controlJdbcTemplate(@Qualifier("controlDataSource") DataSource dataSource) {
        return new JdbcTemplate(dataSource);
    }

    @Bean(name = "jdbcTemplate")
    @Primary
    JdbcTemplate jdbcTemplate(@Qualifier("dataSource") DataSource dataSource) {
        return new JdbcTemplate(dataSource);
    }

    private static HikariDataSource createPool(String poolName, String url, String username,
                                               String password, int maxPoolSize) {
        if (url == null || !url.startsWith("jdbc:postgresql://")) {
            throw new IllegalStateException(poolName + " URL must start with jdbc:postgresql://");
        }
        if (maxPoolSize < 1 || maxPoolSize > 50) {
            throw new IllegalStateException("Connection pool size must be between 1 and 50");
        }
        HikariDataSource pool = new HikariDataSource();
        pool.setPoolName(poolName);
        pool.setJdbcUrl(url);
        if (username != null && !username.isBlank()) pool.setUsername(username);
        if (password != null) pool.setPassword(password);
        pool.setMaximumPoolSize(maxPoolSize);
        pool.setMinimumIdle(0);
        pool.setInitializationFailTimeout(-1);
        return pool;
    }
}
