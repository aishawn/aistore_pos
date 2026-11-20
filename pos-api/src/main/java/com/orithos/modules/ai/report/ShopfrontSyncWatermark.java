package com.orithos.modules.ai.report;

import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import com.orithos.tenant.TenantProperties;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

@Component
public class ShopfrontSyncWatermark {

    static final String KEY_PREFIX = "orithos:reports:v1:sync-stamp:";
    static final Duration MAX_AGE = Duration.ofMinutes(90);

    private final StringRedisTemplate redis;
    private final VendorMapper vendorMapper;
    private final TenantProperties tenantProperties;
    private final Clock clock;

    public ShopfrontSyncWatermark(
            @Qualifier("shopfrontSyncRedisTemplate") StringRedisTemplate redis,
            VendorMapper vendorMapper,
            TenantProperties tenantProperties) {
        this(redis, vendorMapper, tenantProperties, Clock.systemUTC());
    }

    ShopfrontSyncWatermark(StringRedisTemplate redis, VendorMapper vendorMapper,
                           TenantProperties tenantProperties, Clock clock) {
        this.redis = redis;
        this.vendorMapper = vendorMapper;
        this.tenantProperties = tenantProperties;
        this.clock = clock;
    }

    public Optional<Snapshot> read(TenantContext tenant) {
        if (tenant == null) return Optional.empty();
        try {
            Vendor vendor = vendorMapper.findById(tenant.vendorId());
            if (vendor == null || vendor.getSubdomain() == null || vendor.getSubdomain().isBlank()) {
                return Optional.empty();
            }
            String host = URI.create(tenantProperties.storeUrl(vendor.getSubdomain())).getHost();
            if (host == null || host.isBlank()) return Optional.empty();
            String raw = redis.opsForValue().get(KEY_PREFIX + host.toLowerCase(java.util.Locale.ROOT));
            if (raw == null || raw.isBlank()) return Optional.empty();
            Instant syncedAt = Instant.ofEpochMilli(Long.parseLong(raw));
            Instant now = clock.instant();
            Duration age = Duration.between(syncedAt, now);
            return Optional.of(new Snapshot(syncedAt, !age.isNegative() && age.compareTo(MAX_AGE) <= 0));
        } catch (RuntimeException ignored) {
            return Optional.empty();
        }
    }

    public record Snapshot(Instant syncedAt, boolean fresh) {}
}
