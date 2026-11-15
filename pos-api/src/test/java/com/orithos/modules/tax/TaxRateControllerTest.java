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
        when(mapper.findById(11L, 12L)).thenReturn(rate(11L, "GST", false));
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
        when(mapper.findById(11L, 12L)).thenReturn(rate(11L, "GST", false));
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

    @Test
    void createRejectsMissingNegativeAndOverHundredPercentAmounts() {
        authenticate();

        for (BigDecimal amount : List.of(new BigDecimal("-0.0001"), new BigDecimal("100.0001"))) {
            TaxRate create = rate(null, "GST", false);
            create.setAmount(amount);
            assertThrows(BusinessException.class, () -> controller.create(create));
        }

        TaxRate missingAmount = rate(null, "GST", false);
        missingAmount.setAmount(null);
        assertThrows(BusinessException.class, () -> controller.create(missingAmount));
        verify(mapper, never()).insert(any());
    }

    @Test
    void updateRejectsMissingNegativeAndOverHundredPercentAmounts() {
        authenticate();
        when(mapper.findById(11L, 12L)).thenReturn(rate(11L, "GST", false));

        for (BigDecimal amount : List.of(new BigDecimal("-0.0001"), new BigDecimal("100.0001"))) {
            TaxRate update = rate(null, "GST", false);
            update.setAmount(amount);
            assertThrows(BusinessException.class, () -> controller.update(11L, update));
        }

        TaxRate missingAmount = rate(null, "GST", false);
        missingAmount.setAmount(null);
        assertThrows(BusinessException.class, () -> controller.update(11L, missingAmount));
        verify(mapper, never()).update(any(), anyLong());
    }

    @Test
    void createAndUpdateAcceptZeroAndOneHundredPercentAmounts() {
        authenticate();
        when(mapper.findById(11L, 12L)).thenReturn(rate(11L, "GST", false));
        TaxRate createZero = rate(null, "GST Free", false);
        createZero.setAmount(BigDecimal.ZERO);
        TaxRate createHundred = rate(null, "Luxury Tax", false);
        createHundred.setAmount(new BigDecimal("100"));
        TaxRate updateZero = rate(null, "GST Free", false);
        updateZero.setAmount(BigDecimal.ZERO);
        TaxRate updateHundred = rate(null, "Luxury Tax", false);
        updateHundred.setAmount(new BigDecimal("100"));
        when(mapper.findByNameIgnoreCase(anyString(), eq(12L))).thenReturn(null);
        when(mapper.update(any(), eq(12L))).thenReturn(1);

        controller.create(createZero);
        controller.create(createHundred);
        controller.update(11L, updateZero);
        controller.update(11L, updateHundred);

        verify(mapper, times(2)).insert(any());
        verify(mapper, times(2)).update(any(), eq(12L));
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
