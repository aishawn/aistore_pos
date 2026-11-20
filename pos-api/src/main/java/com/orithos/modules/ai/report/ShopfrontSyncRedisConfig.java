package com.orithos.modules.ai.report;

import io.lettuce.core.RedisURI;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Primary;
import org.springframework.boot.autoconfigure.data.redis.RedisProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisPassword;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.Duration;

@Configuration
public class ShopfrontSyncRedisConfig {

    static final int SHOPFRONT_SYNC_DATABASE = 1;

    @Bean(name = "redisConnectionFactory")
    @Primary
    LettuceConnectionFactory redisConnectionFactory(RedisProperties properties) {
        return connectionFactory(properties, properties.getDatabase());
    }

    @Bean(name = "shopfrontSyncRedisConnectionFactory")
    LettuceConnectionFactory shopfrontSyncRedisConnectionFactory(RedisProperties properties) {
        return connectionFactory(properties, SHOPFRONT_SYNC_DATABASE);
    }

    private static LettuceConnectionFactory connectionFactory(RedisProperties properties, int database) {
        RedisURI uri = properties.getUrl() == null || properties.getUrl().isBlank()
                ? null : RedisURI.create(properties.getUrl());
        RedisStandaloneConfiguration server = new RedisStandaloneConfiguration(
                uri == null ? properties.getHost() : uri.getHost(),
                uri == null ? properties.getPort() : uri.getPort());
        server.setDatabase(database);
        String username = uri == null ? null : uri.getUsername();
        if (username == null || username.isBlank()) username = properties.getUsername();
        if (username != null && !username.isBlank()) {
            server.setUsername(username);
        }
        char[] uriPassword = uri == null ? null : uri.getPassword();
        if (uriPassword != null && uriPassword.length > 0) {
            server.setPassword(RedisPassword.of(uriPassword));
        } else if (properties.getPassword() != null && !properties.getPassword().isBlank()) {
            server.setPassword(RedisPassword.of(properties.getPassword()));
        }

        LettuceClientConfiguration.LettuceClientConfigurationBuilder client =
                LettuceClientConfiguration.builder()
                        .commandTimeout(Duration.ofSeconds(2))
                        .shutdownTimeout(Duration.ZERO);
        if (properties.getSsl().isEnabled() || uri != null && uri.isSsl()) client.useSsl();
        return new LettuceConnectionFactory(server, client.build());
    }

    @Bean(name = "shopfrontSyncRedisTemplate")
    StringRedisTemplate shopfrontSyncRedisTemplate(
            @Qualifier("shopfrontSyncRedisConnectionFactory") LettuceConnectionFactory factory) {
        return new StringRedisTemplate(factory);
    }
}
