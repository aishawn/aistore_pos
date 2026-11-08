package com.orithos.modules.supplier;

import com.orithos.common.BusinessException;
import com.orithos.modules.customer.mapper.ContactMapper;
import com.orithos.modules.register.OutletMapper;
import com.orithos.modules.supplier.mapper.SupplierAdditionalContactMapper;
import com.orithos.modules.supplier.mapper.SupplierAuthenticationMapper;
import com.orithos.security.AuthUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class SupplierServiceTenantScopeTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void detailLookupUsesAuthenticatedTenant() {
        setUser(7L, 70L, 700L);
        SupplierMapper suppliers = mock(SupplierMapper.class);
        SupplierService service = service(suppliers, mock(OutletMapper.class));

        when(suppliers.findDetailByIdAndVendor(42L, 70L)).thenReturn(null);

        BusinessException error = assertThrows(BusinessException.class, () -> service.getDetail(42L));

        assertEquals("Supplier not found.", error.getMessage());
        verify(suppliers).findDetailByIdAndVendor(42L, 70L);
        verifyNoMoreInteractions(suppliers);
    }

    @Test
    void updateRejectsSupplierOutsideAuthenticatedTenantBeforeWriting() {
        setUser(7L, 70L, 700L);
        SupplierMapper suppliers = mock(SupplierMapper.class);
        SupplierService service = service(suppliers, mock(OutletMapper.class));

        when(suppliers.findDetailByIdAndVendor(42L, 70L)).thenReturn(null);

        assertThrows(BusinessException.class, () -> service.update(42L, new SupplierDetail()));

        verify(suppliers).findDetailByIdAndVendor(42L, 70L);
        verifyNoMoreInteractions(suppliers);
    }

    @Test
    void createRequiresAnOutletOwnedByAuthenticatedTenant() {
        setUser(7L, 70L, 700L);
        SupplierMapper suppliers = mock(SupplierMapper.class);
        OutletMapper outlets = mock(OutletMapper.class);
        SupplierService service = service(suppliers, outlets);

        when(outlets.findByIdAndVendor(700L, 70L)).thenReturn(null);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.create(new SupplierDetail()));

        assertEquals(40310, error.getCode());
        verify(outlets).findByIdAndVendor(700L, 70L);
        verifyNoInteractions(suppliers);
    }

    private static SupplierService service(SupplierMapper suppliers, OutletMapper outlets) {
        return new SupplierService(suppliers, mock(ContactMapper.class),
                mock(SupplierAuthenticationMapper.class), mock(SupplierAdditionalContactMapper.class),
                mock(PasswordEncoder.class), outlets);
    }

    private static void setUser(Long id, Long vendorId, Long outletId) {
        var authentication = new UsernamePasswordAuthenticationToken(
                new AuthUser(id, "test-user", true, outletId, vendorId), null);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
    }
}
