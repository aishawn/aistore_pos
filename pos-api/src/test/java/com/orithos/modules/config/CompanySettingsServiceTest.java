package com.orithos.modules.config;

import com.orithos.security.AuthUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CompanySettingsServiceTest {

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void importSkipsOrithosOwnedKeys() {
        authenticate();
        SettingMapper mapper = mock(SettingMapper.class);
        Setting ownedMarker = new Setting();
        ownedMarker.setName(CompanySettingsKeys.ownedKey(CompanySettingsKeys.ROUND_TO));
        ownedMarker.setValue("orithos");
        Setting existing = new Setting();
        existing.setName(CompanySettingsKeys.ROUND_TO);
        existing.setValue("0.05");
        when(mapper.findAllGlobal("vendor")).thenReturn(List.of(existing, ownedMarker));

        CompanySettingsService service = new CompanySettingsService(mapper);
        assertFalse(service.importIfEmpty(CompanySettingsKeys.ROUND_TO, "0.10", "number"));
        verify(mapper, never()).upsert(argThat(s -> CompanySettingsKeys.ROUND_TO.equals(s.getName())));
    }

    @Test
    void importWritesMissingKeys() {
        authenticate();
        SettingMapper mapper = mock(SettingMapper.class);
        when(mapper.findAllGlobal("vendor")).thenReturn(List.of());
        CompanySettingsService service = new CompanySettingsService(mapper);
        assertTrue(service.importIfEmpty(CompanySettingsKeys.ROUND_TO, "0.05", "number"));
        verify(mapper).upsert(argThat(s -> CompanySettingsKeys.ROUND_TO.equals(s.getName())
                && "0.05".equals(s.getValue()) && Long.valueOf(3L).equals(s.getScopeId())));
    }

    @Test
    void putOwnedMarksOwnership() {
        authenticate();
        SettingMapper mapper = mock(SettingMapper.class);
        CompanySettingsService service = new CompanySettingsService(mapper);
        service.putOwned(CompanySettingsKeys.ROUND_TO, "0.05", "number");
        verify(mapper, times(2)).upsert(any(Setting.class));
    }

    @Test
    void cashRoundToFallsBackToFiveCents() {
        authenticate();
        SettingMapper mapper = mock(SettingMapper.class);
        when(mapper.findByName("vendor", 3L, CompanySettingsKeys.ROUND_TO)).thenReturn(null);
        when(mapper.findByName("vendor", null, CompanySettingsKeys.ROUND_TO)).thenReturn(null);
        CompanySettingsService service = new CompanySettingsService(mapper);
        assertEquals(new BigDecimal("0.05"), service.cashRoundTo());
    }

    @Test
    void vendorSettingOverridesLegacyGlobalValueWithoutReadingOtherVendors() {
        authenticate();
        SettingMapper mapper = mock(SettingMapper.class);
        Setting legacy = setting(CompanySettingsKeys.ROUND_TO, "0.10", null);
        Setting vendor = setting(CompanySettingsKeys.ROUND_TO, "0.25", 3L);
        when(mapper.findAllGlobal("vendor")).thenReturn(List.of(legacy));
        when(mapper.findAll("vendor", 3L)).thenReturn(List.of(vendor));

        Map<String, CompanySettingsService.SettingView> bundle = new CompanySettingsService(mapper).companyBundle();

        assertEquals("0.25", bundle.get(CompanySettingsKeys.ROUND_TO).value());
        verify(mapper).findAll("vendor", 3L);
    }

    private static Setting setting(String name, String value, Long scopeId) {
        Setting setting = new Setting();
        setting.setName(name);
        setting.setValue(value);
        setting.setScopeType("vendor");
        setting.setScopeId(scopeId);
        return setting;
    }

    private static void authenticate() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "manager", false, 12L, 3L), null, List.of()));
    }
}
