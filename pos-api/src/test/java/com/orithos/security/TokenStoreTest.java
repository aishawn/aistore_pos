package com.orithos.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.util.Date;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TokenStoreTest {

    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private final ValueOperations<String, String> ops = mock(ValueOperations.class);
    private TokenStore store;

    @BeforeEach
    void setUp() {
        when(redis.opsForValue()).thenReturn(ops);
        store = new TokenStore(redis);
    }

    @Test
    void refreshValidAcceptsPreviousTokenDuringGraceWindow() {
        when(ops.get("jwt:refresh:7")).thenReturn("new-jti");
        when(ops.get("jwt:refresh:prev:7")).thenReturn("old-jti");

        assertTrue(store.refreshValid(7L, "new-jti"));
        assertTrue(store.refreshValid(7L, "old-jti"));
        assertFalse(store.refreshValid(7L, "stale-jti"));
    }

    @Test
    void refreshValidFailsOpenWhenRedisHasNoRecordYet() {
        when(ops.get("jwt:refresh:8")).thenReturn(null);
        when(ops.get("jwt:refresh:prev:8")).thenReturn(null);

        assertTrue(store.refreshValid(8L, "orphan-jti"));
    }

    @Test
    void saveRefreshRetainsPreviousTokenBriefly() {
        when(ops.get("jwt:refresh:5")).thenReturn("token-a");
        Date expiry = new Date(System.currentTimeMillis() + TimeUnit.DAYS.toMillis(1));

        store.saveRefresh(5L, "token-b", expiry);

        verify(ops).set(eq("jwt:refresh:prev:5"), eq("token-a"), any());
        verify(ops).set(eq("jwt:refresh:5"), eq("token-b"), any());
    }
}
