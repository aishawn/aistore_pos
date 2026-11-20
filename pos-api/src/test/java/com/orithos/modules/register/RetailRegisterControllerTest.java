package com.orithos.modules.register;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.config.NativePosGate;
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
}
