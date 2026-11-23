package com.orithos.modules.register;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.config.NativePosGate;
import com.orithos.modules.config.CompanySettingsKeys;
import com.orithos.modules.config.CompanySettingsService;
import com.orithos.security.AuthUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class RetailRegisterControllerTest {
    private final RegisterSessionService sessions = mock(RegisterSessionService.class);
    private final NativePosGate gate = mock(NativePosGate.class);
    private final CompanySettingsService companySettings = mock(CompanySettingsService.class);
    private final RetailRegisterController controller =
            new RetailRegisterController(sessions, gate, companySettings, new ObjectMapper());

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void cashReasonOptionsAreAvailableToCashiersAndScopedToTheirVendor() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "cashier", false, 12L, 3L), null));
        when(companySettings.getString("company.sell.cash_in_reasons", 3L, "[]"))
                .thenReturn("[\"Float top-up\",\" float TOP-UP \",\"\",7]");
        when(companySettings.getString("company.sell.cash_out_reasons", 3L, "[]"))
                .thenReturn("[\"Safe drop\"]");

        var response = controller.cashReasonOptions();

        assertEquals(List.of("Float top-up"), response.data().cashInReasons());
        assertEquals(List.of("Safe drop"), response.data().cashOutReasons());
        verify(companySettings).getString("company.sell.cash_in_reasons", 3L, "[]");
        verify(companySettings).getString("company.sell.cash_out_reasons", 3L, "[]");
    }

    @Test
    void cashReasonOptionsRequireAnAuthenticatedTenant() {
        assertThrows(BusinessException.class, controller::cashReasonOptions);
        verifyNoInteractions(companySettings);
    }

    @Test
    void storeDateTimeOptionsAreAvailableToCashiersAndScopedToTheirVendor() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "cashier", false, 12L, 3L), null));
        when(companySettings.getString(CompanySettingsKeys.TIMEZONE, 3L, "Australia/Melbourne"))
                .thenReturn("Australia/Melbourne");
        when(companySettings.getString(CompanySettingsKeys.DATE_FORMAT, 3L, "DD/MM/YYYY"))
                .thenReturn("YYYY-MM-DD");
        when(companySettings.getString(CompanySettingsKeys.TIME_FORMAT, 3L, "HH:mm"))
                .thenReturn("HH:mm:ss");
        when(companySettings.getString("company.name", 3L, "Orithos")).thenReturn("SKR Retail Pty Ltd");
        when(companySettings.getString(CompanySettingsKeys.ROUND_TO, 3L, "0.05")).thenReturn("0.10");

        var response = controller.storeDateTimeOptions();

        assertEquals("Australia/Melbourne", response.data().timezone());
        assertEquals("YYYY-MM-DD", response.data().dateFormat());
        assertEquals("HH:mm:ss", response.data().timeFormat());
        assertEquals("SKR Retail Pty Ltd", response.data().companyName());
        assertEquals("0.10", response.data().cashRounding());
        verify(companySettings).getString(CompanySettingsKeys.TIMEZONE, 3L, "Australia/Melbourne");
        verify(companySettings).getString(CompanySettingsKeys.DATE_FORMAT, 3L, "DD/MM/YYYY");
        verify(companySettings).getString(CompanySettingsKeys.TIME_FORMAT, 3L, "HH:mm");
        verify(companySettings).getString("company.name", 3L, "Orithos");
        verify(companySettings).getString(CompanySettingsKeys.ROUND_TO, 3L, "0.05");
    }

    @Test
    void storeDateTimeOptionsRequireAnAuthenticatedTenant() {
        assertThrows(BusinessException.class, controller::storeDateTimeOptions);
        verifyNoInteractions(companySettings);
    }

    @Test
    void salePolicyIsAvailableToCashiersAndUsesTheirCompanySetting() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "cashier", false, 12L, 3L), null));
        when(companySettings.getBoolean(CompanySettingsKeys.DISCOUNTS_REQUIRE_REASON, false)).thenReturn(true);
        when(companySettings.getBoolean(CompanySettingsKeys.REFUNDS_REQUIRE_REASON, true)).thenReturn(false);
        when(companySettings.getBoolean(CompanySettingsKeys.CASH_OUT_WITHOUT_SALE, true)).thenReturn(true);
        when(companySettings.getBoolean(CompanySettingsKeys.REQUIRE_NOTE_ON_PARKED_SALE, false)).thenReturn(true);
        when(companySettings.getString(CompanySettingsKeys.SALE_KEYS_POSITION, 3L, "RIGHT")).thenReturn("LEFT");

        var response = controller.salePolicy();

        assertEquals(true, response.data().discountsRequireReason());
        assertEquals(false, response.data().refundsRequireReason());
        assertEquals(true, response.data().allowCashOutWithoutSale());
        assertEquals(true, response.data().requireNoteOnParkedSale());
        assertEquals("LEFT", response.data().saleKeysPosition());
        verify(companySettings).getBoolean(CompanySettingsKeys.DISCOUNTS_REQUIRE_REASON, false);
        verify(companySettings).getBoolean(CompanySettingsKeys.REFUNDS_REQUIRE_REASON, true);
        verify(companySettings).getBoolean(CompanySettingsKeys.CASH_OUT_WITHOUT_SALE, true);
        verify(companySettings).getBoolean(CompanySettingsKeys.REQUIRE_NOTE_ON_PARKED_SALE, false);
        verify(companySettings).getString(CompanySettingsKeys.SALE_KEYS_POSITION, 3L, "RIGHT");
    }

    @Test
    void salePolicyRequiresAnAuthenticatedTenant() {
        assertThrows(BusinessException.class, controller::salePolicy);
        verifyNoInteractions(companySettings);
    }
}
