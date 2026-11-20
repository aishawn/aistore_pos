package com.orithos.modules.ai.report;

import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import com.orithos.tenant.TenantProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.data.redis.RedisProperties;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.lang.reflect.Constructor;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ShopfrontSyncWatermarkTest {

    private static final Instant NOW = Instant.parse("2026-11-20T02:00:00Z");
    private StringRedisTemplate redis;
    private VendorMapper vendorMapper;
    private ValueOperations<String, String> values;
    private SetOperations<String, String> sets;
    private ShopfrontSyncWatermark watermark;

    @Test
    void marksTheProductionConstructorForSpringInjection() {
        Constructor<?>[] constructors = ShopfrontSyncWatermark.class.getDeclaredConstructors();

        assertEquals(1, Arrays.stream(constructors)
                .filter(constructor -> constructor.isAnnotationPresent(Autowired.class))
                .count());
    }

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        redis = mock(StringRedisTemplate.class);
        vendorMapper = mock(VendorMapper.class);
        values = mock(ValueOperations.class);
        sets = mock(SetOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        when(redis.opsForSet()).thenReturn(sets);
        when(sets.members("orithos:reports:v1:sync-days:demo.orithos.com.au"))
                .thenReturn(Set.of());
        TenantProperties tenantProperties = new TenantProperties();
        tenantProperties.setBaseDomain("orithos.com.au");
        watermark = new ShopfrontSyncWatermark(redis, vendorMapper, tenantProperties,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void readsOnlyTheAuthenticatedVendorsHostWatermarkAndMarksFreshStamp() {
        Vendor vendor = new Vendor();
        vendor.setSubdomain("demo");
        when(vendorMapper.findById(55L)).thenReturn(vendor);
        when(values.get("orithos:reports:v1:sync-stamp:demo.orithos.com.au"))
                .thenReturn(Long.toString(NOW.minusSeconds(60).toEpochMilli()));
        Optional<ShopfrontSyncWatermark.Snapshot> result = watermark.read(tenant(55L));

        assertTrue(result.isPresent());
        assertTrue(result.get().fresh());
        assertEquals(NOW.minusSeconds(60), result.get().syncedAt());
        verify(vendorMapper).findById(55L);
        verify(values).get("orithos:reports:v1:sync-stamp:demo.orithos.com.au");
        verify(values, never()).get("orithos:reports:v1:sync-stamp:global");
    }

    @Test
    void readsSuccessfulBusinessDayCoverageForRequestedReportWindow() {
        Vendor vendor = new Vendor();
        vendor.setSubdomain("demo");
        when(vendorMapper.findById(55L)).thenReturn(vendor);
        when(values.get("orithos:reports:v1:sync-stamp:demo.orithos.com.au"))
                .thenReturn(Long.toString(NOW.minusSeconds(60).toEpochMilli()));
        when(values.get("orithos:reports:v1:sync-through:demo.orithos.com.au"))
                .thenReturn("2026-11-20");
        when(sets.members("orithos:reports:v1:sync-days:demo.orithos.com.au"))
                .thenReturn(Set.of("2026-11-19", "2026-11-20", "malformed"));

        ShopfrontSyncWatermark.Snapshot result = watermark.read(tenant(55L),
                java.time.LocalDate.parse("2026-11-19"), java.time.LocalDate.parse("2026-11-20"))
                .orElseThrow();

        assertTrue(result.fresh());
        assertEquals(java.time.LocalDate.parse("2026-11-20"), result.latestThroughDay());
        assertTrue(result.covers(java.time.LocalDate.parse("2026-11-19"),
                java.time.LocalDate.parse("2026-11-20")));
        assertFalse(result.covers(java.time.LocalDate.parse("2026-11-18"),
                java.time.LocalDate.parse("2026-11-20")));
    }

    @Test
    void marksWatermarkAtNinetyMinutesFreshAndOlderWatermarkStale() {
        Vendor vendor = new Vendor();
        vendor.setSubdomain("demo");
        when(vendorMapper.findById(55L)).thenReturn(vendor);
        when(values.get("orithos:reports:v1:sync-stamp:demo.orithos.com.au"))
                .thenReturn(Long.toString(NOW.minus(Duration.ofMinutes(90)).toEpochMilli()))
                .thenReturn(Long.toString(NOW.minus(Duration.ofMinutes(91)).toEpochMilli()));

        assertTrue(watermark.read(tenant(55L)).orElseThrow().fresh());
        assertFalse(watermark.read(tenant(55L)).orElseThrow().fresh());
    }

    @Test
    void returnsNoWatermarkWhenTenantOrRedisValueCannotBeTrusted() {
        when(vendorMapper.findById(55L)).thenReturn(null);
        assertTrue(watermark.read(tenant(55L)).isEmpty());
        verify(redis, never()).opsForValue();

        Vendor vendor = new Vendor();
        vendor.setSubdomain("demo");
        when(vendorMapper.findById(55L)).thenReturn(vendor);
        when(values.get("orithos:reports:v1:sync-stamp:demo.orithos.com.au")).thenReturn("not-a-timestamp");
        assertTrue(watermark.read(tenant(55L)).isEmpty());
    }

    @Test
    void redisReadFailureReturnsUnknownWatermark() {
        Vendor vendor = new Vendor();
        vendor.setSubdomain("demo");
        when(vendorMapper.findById(55L)).thenReturn(vendor);
        when(values.get("orithos:reports:v1:sync-stamp:demo.orithos.com.au"))
                .thenThrow(new IllegalStateException("Redis unavailable"));

        assertTrue(watermark.read(tenant(55L)).isEmpty());
    }

    @Test
    void businessRedisKeepsConfiguredDatabaseWhileSyncReaderUsesDatabaseOne() {
        RedisProperties properties = new RedisProperties();
        properties.setUrl("redis://test-user:test-password@redis.example.test:6381/0");
        ShopfrontSyncRedisConfig config = new ShopfrontSyncRedisConfig();
        LettuceConnectionFactory businessFactory = config
                .redisConnectionFactory(properties);
        LettuceConnectionFactory syncFactory = config
                .shopfrontSyncRedisConnectionFactory(properties);
        try {
            assertEquals(0, businessFactory.getDatabase());
            assertEquals(1, syncFactory.getDatabase());
            assertEquals("redis.example.test", syncFactory.getStandaloneConfiguration().getHostName());
            assertEquals(6381, syncFactory.getStandaloneConfiguration().getPort());
            assertEquals("test-user", syncFactory.getStandaloneConfiguration().getUsername());
        } finally {
            businessFactory.destroy();
            syncFactory.destroy();
        }
    }

    private static TenantContext tenant(long vendorId) {
        return new TenantContext(vendorId, 1L, 87L, List.of(87L), Set.of(TenantContext.PERM_QUERY));
    }
}
