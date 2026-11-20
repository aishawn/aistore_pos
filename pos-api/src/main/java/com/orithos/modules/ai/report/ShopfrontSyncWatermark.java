package com.orithos.modules.ai.report;

import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import com.orithos.tenant.TenantProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;

@Component
public class ShopfrontSyncWatermark {

    static final String KEY_PREFIX = "orithos:reports:v1:sync-stamp:";
    static final String THROUGH_KEY_PREFIX = "orithos:reports:v1:sync-through:";
    static final String COVERAGE_KEY_PREFIX = "orithos:reports:v1:sync-days:";
    static final Duration MAX_AGE = Duration.ofMinutes(90);

    private final StringRedisTemplate redis;
    private final VendorMapper vendorMapper;
    private final TenantProperties tenantProperties;
    private final Clock clock;

    @Autowired
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
        return read(tenant, null, null);
    }

    public Optional<Snapshot> read(TenantContext tenant, LocalDate fromDay, LocalDate toDay) {
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
            String rawThroughDay = redis.opsForValue().get(
                    THROUGH_KEY_PREFIX + host.toLowerCase(java.util.Locale.ROOT));
            LocalDate latestThroughDay = rawThroughDay == null ? null : LocalDate.parse(rawThroughDay);
            Instant now = clock.instant();
            Duration age = Duration.between(syncedAt, now);
            Set<LocalDate> coveredDays = new HashSet<>();
            Set<String> rawDays = redis.opsForSet().members(
                    COVERAGE_KEY_PREFIX + host.toLowerCase(java.util.Locale.ROOT));
            if (rawDays != null) {
                for (String day : rawDays) {
                    try {
                        coveredDays.add(LocalDate.parse(day));
                    } catch (RuntimeException ignored) {
                        // Ignore malformed coverage members; missing days fail closed.
                    }
                }
            }
            return Optional.of(new Snapshot(syncedAt,
                    !age.isNegative() && age.compareTo(MAX_AGE) <= 0, coveredDays, latestThroughDay));
        } catch (RuntimeException ignored) {
            return Optional.empty();
        }
    }

    public record Snapshot(Instant syncedAt, boolean fresh, Set<LocalDate> coveredDays,
                           LocalDate latestThroughDay) {
        public Snapshot {
            coveredDays = coveredDays == null ? Set.of() : Set.copyOf(coveredDays);
        }

        public Snapshot(Instant syncedAt, boolean fresh) {
            this(syncedAt, fresh, Set.of(), null);
        }

        public Snapshot(Instant syncedAt, boolean fresh, Set<LocalDate> coveredDays) {
            this(syncedAt, fresh, coveredDays, null);
        }

        public boolean covers(LocalDate fromDay, LocalDate toDay) {
            if (fromDay == null || toDay == null || fromDay.isAfter(toDay)
                    || latestThroughDay == null || latestThroughDay.isBefore(toDay)) return false;
            for (LocalDate day = fromDay; !day.isAfter(toDay); day = day.plusDays(1)) {
                if (!coveredDays.contains(day)) return false;
            }
            return true;
        }
    }
}
