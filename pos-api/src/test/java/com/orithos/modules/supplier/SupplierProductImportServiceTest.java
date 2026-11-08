package com.orithos.modules.supplier;

import com.orithos.common.BusinessException;
import com.orithos.modules.supplier.mapper.SupplierProductImportMapper;
import com.orithos.security.AuthUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class SupplierProductImportServiceTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void unknownProductIsReportedWithoutCreatingAnIncompleteProduct() {
        setUser(70L);
        SupplierMapper suppliers = mock(SupplierMapper.class);
        SupplierProductImportMapper imports = mock(SupplierProductImportMapper.class);
        when(suppliers.findByIdAndVendor(10L, 70L)).thenReturn(new Supplier());
        when(imports.countExisting(10L, "SKU-1", 70L)).thenReturn(0);
        when(imports.findProductIdByCode("SKU-1", 70L)).thenReturn(null);
        when(imports.findProductIdByMasterReference("SKU-1", 70L)).thenReturn(null);

        SupplierProductImportResult result = new SupplierProductImportService(suppliers, imports)
                .importProducts(10L, "SKU-1");

        assertEquals(0, result.getImported());
        assertEquals(1, result.getErrors().size());
        assertEquals(1, result.getErrors().getFirst().getLine());
        verify(imports, never()).insertLink(anyLong(), eq(10L), eq("SKU-1"), eq(70L));
    }

    @Test
    void uniqueExistingTenantProductCanBeLinkedIdempotently() {
        setUser(70L);
        SupplierMapper suppliers = mock(SupplierMapper.class);
        SupplierProductImportMapper imports = mock(SupplierProductImportMapper.class);
        when(suppliers.findByIdAndVendor(10L, 70L)).thenReturn(new Supplier());
        when(imports.countExisting(10L, "SKU-1", 70L)).thenReturn(0);
        when(imports.findProductIdByCode("SKU-1", 70L)).thenReturn(100L);
        when(imports.insertLink(100L, 10L, "SKU-1", 70L)).thenReturn(1);

        SupplierProductImportResult result = new SupplierProductImportService(suppliers, imports)
                .importProducts(10L, "SKU-1");

        assertEquals(1, result.getImported());
        assertEquals(0, result.getErrors().size());
        verify(imports).lockSupplierProductCode(70L, 10L, "SKU-1");
        verify(imports).insertLink(100L, 10L, "SKU-1", 70L);
    }

    @Test
    void supplierOutsideTenantIsRejectedBeforeImportQueries() {
        setUser(70L);
        SupplierMapper suppliers = mock(SupplierMapper.class);
        SupplierProductImportMapper imports = mock(SupplierProductImportMapper.class);
        when(suppliers.findByIdAndVendor(10L, 70L)).thenReturn(null);

        SupplierProductImportService service = new SupplierProductImportService(suppliers, imports);

        assertThrows(BusinessException.class, () -> service.importProducts(10L, "SKU-1"));
        verifyNoInteractions(imports);
    }

    @Test
    void repeatedSupplierCodeIsSkippedWithoutCreatingAnotherLink() {
        setUser(70L);
        SupplierMapper suppliers = mock(SupplierMapper.class);
        SupplierProductImportMapper imports = mock(SupplierProductImportMapper.class);
        when(suppliers.findByIdAndVendor(10L, 70L)).thenReturn(new Supplier());
        when(imports.countExisting(10L, "SKU-1", 70L)).thenReturn(1);

        SupplierProductImportResult result = new SupplierProductImportService(suppliers, imports)
                .importProducts(10L, "SKU-1");

        assertEquals(0, result.getImported());
        assertEquals(1, result.getSkipped());
        verify(imports, never()).insertLink(anyLong(), eq(10L), eq("SKU-1"), eq(70L));
    }

    private static void setUser(Long vendorId) {
        var authentication = new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "test-user", true, 700L, vendorId), null);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
    }
}
