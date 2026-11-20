package com.orithos.modules.report;

import com.orithos.modules.config.CompanySettingsKeys;
import com.orithos.modules.config.CompanySettingsService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReportQueryServiceWeekStartTest {

    @Test
    void weekStartUsesVendorConfiguredSundayOrMonday() {
        CompanySettingsService settings = mock(CompanySettingsService.class);
        when(settings.getString(CompanySettingsKeys.START_OF_WEEK, 55L, "MONDAY")).thenReturn("SUNDAY");
        when(settings.getString(CompanySettingsKeys.START_OF_WEEK, 56L, "MONDAY")).thenReturn("MONDAY");
        ReportQueryService service = new ReportQueryService(
                mock(JdbcTemplate.class), Clock.systemUTC(), Duration.ofSeconds(10), null, settings);

        LocalDate monday = LocalDate.of(2026, 11, 23);

        assertEquals(LocalDate.of(2026, 11, 22), service.weekStart(monday, 55L));
        assertEquals(monday, service.weekStart(monday, 56L));
        org.mockito.Mockito.verify(settings).getString(eq(CompanySettingsKeys.START_OF_WEEK), eq(55L), eq("MONDAY"));
    }
}
