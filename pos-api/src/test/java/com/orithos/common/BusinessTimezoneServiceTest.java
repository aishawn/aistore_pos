package com.orithos.common;

import com.orithos.modules.config.CompanySettingsKeys;
import com.orithos.modules.config.CompanySettingsService;
import org.junit.jupiter.api.Test;

import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class BusinessTimezoneServiceTest {

    @Test
    void resolvesEachVendorsConfiguredTimezone() {
        CompanySettingsService settings = mock(CompanySettingsService.class);
        when(settings.getString(CompanySettingsKeys.TIMEZONE, 55L, "Australia/Melbourne"))
                .thenReturn("Australia/Melbourne");
        when(settings.getString(CompanySettingsKeys.TIMEZONE, 1L, "Australia/Melbourne"))
                .thenReturn("Australia/Adelaide");

        BusinessTimezoneService timezones = new BusinessTimezoneService(settings);

        assertEquals(ZoneId.of("Australia/Melbourne"), timezones.zoneForVendor(55L));
        assertEquals(ZoneId.of("Australia/Adelaide"), timezones.zoneForVendor(1L));
    }

    @Test
    void fallsBackToConfiguredDefaultWhenTimezoneIsInvalid() {
        CompanySettingsService settings = mock(CompanySettingsService.class);
        when(settings.getString(CompanySettingsKeys.TIMEZONE, 55L, "Australia/Melbourne"))
                .thenReturn("Not/A_Real_Zone");

        BusinessTimezoneService timezones = new BusinessTimezoneService(settings);

        assertEquals(ZoneId.of("Australia/Melbourne"), timezones.zoneForVendor(55L));
    }
}
