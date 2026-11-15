package com.orithos.modules.tax;

import com.orithos.security.AuthUser;
import com.orithos.common.BusinessException;
import com.orithos.security.PermissionAccess;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;

class TaxRateControllerTest {
    private final TaxRateMapper mapper = mock(TaxRateMapper.class);
    private final PermissionAccess permissions = mock(PermissionAccess.class);
    private final TaxRateController controller = new TaxRateController(mapper, permissions);

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void updateRejectsAnotherRateWithTheSameNormalizedName() {
        authenticate();
        TaxRate existing = rate(10L, "GST", false);
        when(mapper.existsOtherByNameIgnoreCase("gst", 11L, 12L)).thenReturn(true);
        TaxRate update = rate(null, "gst", false);

        BusinessException error = assertThrows(BusinessException.class, () -> controller.update(11L, update));

        assertEquals("tax_rate_name_exists", error.getMessage());
        verify(mapper, never()).update(any(), anyLong());
    }

    @Test
    void createRejectsAnotherRateWithTheSameNameIgnoringCase() {
        authenticate();
        when(mapper.findByNameIgnoreCase("gst", 12L)).thenReturn(rate(10L, "GST", false));
        TaxRate create = rate(null, "gst", false);

        BusinessException error = assertThrows(BusinessException.class, () -> controller.create(create));

        assertEquals("tax_rate_name_exists", error.getMessage());
        verify(mapper, never()).insert(any());
    }

    @Test
    void updateCanKeepItsOwnNameAndClearsOtherDefaultsBeforeSettingDefault() {
        authenticate();
        when(mapper.existsOtherByNameIgnoreCase("GST", 11L, 12L)).thenReturn(false);
        when(mapper.update(any(), eq(12L))).thenReturn(1);
        TaxRate update = rate(null, "GST", true);

        controller.update(11L, update);

        var order = inOrder(mapper);
        order.verify(mapper).existsOtherByNameIgnoreCase("GST", 11L, 12L);
        order.verify(mapper).clearDefaults(12L);
        order.verify(mapper).update(update, 12L);
    }

    @Test
    void createClearsExistingDefaultsBeforeCreatingTheNewDefault() {
        authenticate();
        when(mapper.findByNameIgnoreCase("GST", 12L)).thenReturn(null);
        TaxRate create = rate(null, "GST", true);

        controller.create(create);

        var order = inOrder(mapper);
        order.verify(mapper).findByNameIgnoreCase("GST", 12L);
        order.verify(mapper).clearDefaults(12L);
        order.verify(mapper).insert(create);
    }

    private static void authenticate() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "manager", false, 12L, 3L), null, List.of()));
    }

    private static TaxRate rate(Long id, String name, boolean isDefault) {
        TaxRate rate = new TaxRate();
        rate.setId(id);
        rate.setName(name);
        rate.setAmount(new BigDecimal("10.0000"));
        rate.setIsDefault(isDefault);
        return rate;
    }
}
