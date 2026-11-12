package com.orithos.modules.config;

import com.orithos.modules.payment.PaymentMethodController;
import com.orithos.modules.payment.PaymentMethodMapper;
import com.orithos.modules.tax.TaxRate;
import com.orithos.modules.tax.TaxRateController;
import com.orithos.modules.tax.TaxRateMapper;
import com.orithos.security.AuthUser;
import com.orithos.security.PermissionAccess;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SetupCatalogOutletScopeTest {
    private static final Long OUTLET_ID = 87L;

    @BeforeEach
    void authenticateAsSkrStoreAdmin() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(42L, "admin", true, OUTLET_ID, 55L), "test",
                List.of()));
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void catalogListsAreScopedToTheAuthenticatedOutlet() {
        TaxRateMapper taxRates = mock(TaxRateMapper.class);
        PaymentMethodMapper paymentMethods = mock(PaymentMethodMapper.class);
        when(taxRates.findAll(OUTLET_ID)).thenReturn(List.of());
        when(paymentMethods.findAll(OUTLET_ID)).thenReturn(List.of());

        new TaxRateController(taxRates, mock(PermissionAccess.class)).list();
        new PaymentMethodController(paymentMethods, mock(PermissionAccess.class)).list();

        verify(taxRates).findAll(OUTLET_ID);
        verify(paymentMethods).findAll(OUTLET_ID);
    }

    @Test
    void foreignOutletCatalogIdsCannotBeReadOrMutated() {
        TaxRateMapper taxRates = mock(TaxRateMapper.class);
        PaymentMethodMapper paymentMethods = mock(PaymentMethodMapper.class);
        PermissionAccess permissions = mock(PermissionAccess.class);
        TaxRateController taxController = new TaxRateController(taxRates, permissions);
        PaymentMethodController paymentController = new PaymentMethodController(paymentMethods, permissions);
        when(taxRates.findById(200L, OUTLET_ID)).thenReturn(null);
        when(taxRates.update(any(TaxRate.class), eq(OUTLET_ID))).thenReturn(0);
        when(paymentMethods.findById(300L, OUTLET_ID)).thenReturn(null);
        when(paymentMethods.softDelete(300L, OUTLET_ID)).thenReturn(0);

        ResponseStatusException taxRead = assertThrows(ResponseStatusException.class,
                () -> taxController.get(200L));
        assertEquals(HttpStatus.NOT_FOUND, taxRead.getStatusCode());
        ResponseStatusException taxWrite = assertThrows(ResponseStatusException.class,
                () -> taxController.update(200L, new TaxRate()));
        assertEquals(HttpStatus.NOT_FOUND, taxWrite.getStatusCode());
        ResponseStatusException paymentRead = assertThrows(ResponseStatusException.class,
                () -> paymentController.get(300L));
        assertEquals(HttpStatus.NOT_FOUND, paymentRead.getStatusCode());
        ResponseStatusException paymentWrite = assertThrows(ResponseStatusException.class,
                () -> paymentController.delete(300L));
        assertEquals(HttpStatus.NOT_FOUND, paymentWrite.getStatusCode());

        verify(taxRates).findById(200L, OUTLET_ID);
        verify(taxRates).update(any(TaxRate.class), eq(OUTLET_ID));
        verify(paymentMethods).findById(300L, OUTLET_ID);
        verify(paymentMethods).softDelete(300L, OUTLET_ID);
        verify(taxRates, never()).softDelete(200L, OUTLET_ID);
    }

    @Test
    void taxMergeValidatesEverySourceBeforeReassigningReferences() {
        TaxRateMapper taxRates = mock(TaxRateMapper.class);
        TaxRate target = new TaxRate();
        target.setId(10L);
        target.setOutletId(OUTLET_ID);
        when(taxRates.findById(10L, OUTLET_ID)).thenReturn(target);
        when(taxRates.findById(11L, OUTLET_ID)).thenReturn(null);
        TaxRateController controller = new TaxRateController(taxRates, mock(PermissionAccess.class));

        ResponseStatusException failure = assertThrows(ResponseStatusException.class,
                () -> controller.merge(10L, new TaxRateController.MergeRequest(List.of(11L))));

        assertEquals(HttpStatus.NOT_FOUND, failure.getStatusCode());
        verify(taxRates, never()).reassignProductTaxRate(10L, 11L, OUTLET_ID);
        verify(taxRates, never()).softDelete(11L, OUTLET_ID);
    }
}
