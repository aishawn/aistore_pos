package com.orithos.common;

import com.orithos.modules.config.CompanySettingsKeys;
import com.orithos.modules.config.CompanySettingsService;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

@Service
public class BusinessTimezoneService {

    private static final ZoneId DEFAULT_ZONE = ZoneId.of(
            CompanySettingsKeys.defaults().get(CompanySettingsKeys.TIMEZONE));

    private final CompanySettingsService companySettings;

    public BusinessTimezoneService(CompanySettingsService companySettings) {
        this.companySettings = companySettings;
    }

    public ZoneId zoneForVendor(Long vendorId) {
        if (vendorId == null) return DEFAULT_ZONE;
        String configured = companySettings.getString(
                CompanySettingsKeys.TIMEZONE, vendorId, DEFAULT_ZONE.getId());
        try {
            return ZoneId.of(configured);
        } catch (RuntimeException ignored) {
            return DEFAULT_ZONE;
        }
    }

    public LocalDate today(Long vendorId) {
        return LocalDate.now(zoneForVendor(vendorId));
    }

    public LocalDateTime localNow(Long vendorId) {
        return LocalDateTime.now(zoneForVendor(vendorId));
    }

    public LocalDate businessDate(Instant instant, Long vendorId) {
        return instant.atZone(zoneForVendor(vendorId)).toLocalDate();
    }

    public ZonedDateTime fromUtcWall(LocalDateTime utcWall, Long vendorId) {
        return utcWall.atZone(java.time.ZoneOffset.UTC).withZoneSameInstant(zoneForVendor(vendorId));
    }
}
