package com.orithos.modules.config;

import com.orithos.security.AuthUser;
import com.orithos.security.PermissionAccess;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.*;

class SettingControllerScopeTest {
    private final SettingMapper mapper = mock(SettingMapper.class);
    private final CompanySettingsService companySettings = mock(CompanySettingsService.class);
    private final PermissionAccess permissions = mock(PermissionAccess.class);
    private final SettingController controller = new SettingController(mapper, companySettings, permissions);

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void listIgnoresRequestedVendorScopeAndUsesAuthenticatedVendor() {
        authenticate();

        controller.list("vendor", 999L);

        verify(mapper).findAll("vendor", 3L);
    }

    @Test
    void listDefaultsToAuthenticatedVendorInsteadOfAllSettings() {
        authenticate();

        controller.list(null, null);

        verify(mapper).findAll("vendor", 3L);
    }

    @Test
    void upsertReplacesClientScopeWithAuthenticatedVendor() {
        authenticate();
        Setting setting = new Setting();
        setting.setScopeType("vendor");
        setting.setScopeId(999L);
        setting.setName("loyalty");
        setting.setValue("{}");

        controller.upsert(setting);

        verify(mapper).upsert(argThat(saved -> "vendor".equals(saved.getScopeType())
                && Long.valueOf(3L).equals(saved.getScopeId())));
    }

    private static void authenticate() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "manager", false, 12L, 3L), null, List.of()));
    }
}
