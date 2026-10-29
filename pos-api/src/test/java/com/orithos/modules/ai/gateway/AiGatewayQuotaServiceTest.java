package com.orithos.modules.ai.gateway;

import com.orithos.common.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AiGatewayQuotaServiceTest {
    @Test
    void estimatesTextAndCapsImageByteEstimate() {
        assertEquals(1025, AiGatewayQuotaService.estimateTokens("a"));
        assertEquals(1024 + 100_000, AiGatewayQuotaService.estimateMediaTokens(new byte[1_000_000], ""));
    }

    @Test
    void redisUnavailableFailsClosed() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        AiGatewayQuotaService service = new AiGatewayQuotaService(redis, new AiGatewayProperties());

        when(redis.execute(any(), anyList(), any(Object[].class))).thenThrow(new IllegalStateException("redis down"));

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.reserve(new AiTenantContext(1, 2, 3, "test"), 100));
        assertEquals(50320, error.getCode());
    }

    @Test
    void quotaRejectionStopsTheProviderRequest() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        AiGatewayQuotaService service = new AiGatewayQuotaService(redis, new AiGatewayProperties());

        when(redis.execute(any(), anyList(), any(Object[].class))).thenReturn(0L);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.reserve(new AiTenantContext(1, 2, 3, "test"), 100));
        assertEquals(42901, error.getCode());
    }
}
