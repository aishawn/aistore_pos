package com.orithos.modules.config;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CompanySettingsServiceTest {

    @Test
    void importSkipsOrithosOwnedKeys() {
        SettingMapper mapper = mock(SettingMapper.class);
        Setting ownedMarker = new Setting();
        ownedMarker.setName(CompanySettingsKeys.ownedKey(CompanySettingsKeys.ROUND_TO));
        ownedMarker.setValue("orithos");
        Setting existing = new Setting();
        existing.setName(CompanySettingsKeys.ROUND_TO);
        existing.setValue("0.05");
        when(mapper.findAll("vendor", null)).thenReturn(List.of(existing, ownedMarker));

        CompanySettingsService service = new CompanySettingsService(mapper);
        assertFalse(service.importIfEmpty(CompanySettingsKeys.ROUND_TO, "0.10", "number"));
        verify(mapper, never()).upsert(argThat(s -> CompanySettingsKeys.ROUND_TO.equals(s.getName())));
    }

    @Test
    void importWritesMissingKeys() {
        SettingMapper mapper = mock(SettingMapper.class);
        when(mapper.findAll("vendor", null)).thenReturn(List.of());
        CompanySettingsService service = new CompanySettingsService(mapper);
        assertTrue(service.importIfEmpty(CompanySettingsKeys.ROUND_TO, "0.05", "number"));
        verify(mapper).upsert(argThat(s -> CompanySettingsKeys.ROUND_TO.equals(s.getName())
                && "0.05".equals(s.getValue())));
    }

    @Test
    void putOwnedMarksOwnership() {
        SettingMapper mapper = mock(SettingMapper.class);
        CompanySettingsService service = new CompanySettingsService(mapper);
        service.putOwned(CompanySettingsKeys.ROUND_TO, "0.05", "number");
        verify(mapper, times(2)).upsert(any(Setting.class));
    }

    @Test
    void cashRoundToFallsBackToFiveCents() {
        SettingMapper mapper = mock(SettingMapper.class);
        when(mapper.findByName("vendor", null, CompanySettingsKeys.ROUND_TO)).thenReturn(null);
        CompanySettingsService service = new CompanySettingsService(mapper);
        assertEquals(new BigDecimal("0.05"), service.cashRoundTo());
    }
}
