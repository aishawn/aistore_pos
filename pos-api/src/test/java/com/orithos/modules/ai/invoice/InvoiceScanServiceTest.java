package com.orithos.modules.ai.invoice;

import com.orithos.common.BusinessException;
import com.orithos.modules.order.OrderService;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.modules.product.ProductService;
import com.orithos.modules.register.Outlet;
import com.orithos.modules.register.OutletMapper;
import com.orithos.modules.supplier.Supplier;
import com.orithos.modules.supplier.SupplierMapper;
import com.orithos.modules.supplier.SupplierService;
import com.orithos.security.AuthUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verifyNoMoreInteractions;

class InvoiceScanServiceTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void scanDelegatesMultipartPreviewToAvailableVisionProvider() {
        ObjectProvider<InvoiceVisionService> vision = mock(ObjectProvider.class);
        InvoiceVisionService provider = mock(InvoiceVisionService.class);
        OutletMapper outletMapper = mock(OutletMapper.class);
        setUser(70L, 700L);
        InvoiceScanService service = new InvoiceScanService(
                vision, mock(SupplierMapper.class), mock(SupplierService.class),
                mock(ProductMapper.class), mock(ProductService.class),
                outletMapper, mock(OrderService.class));
        when(vision.getIfAvailable()).thenReturn(provider);
        when(outletMapper.findByIdAndVendor(700L, 70L)).thenReturn(new Outlet());
        when(provider.read(org.mockito.ArgumentMatchers.any())).thenReturn(
                new TaxInvoiceRead("Acme", null, null, "INV-1", null, null, null,
                        null, null, null, null, null, null, null, java.util.List.of()));

        InvoiceScanResponse actual = service.scan(new MockMultipartFile(
                "file", "invoice.jpg", "image/jpeg", new byte[]{1, 2}));

        assertEquals("Acme", actual.getSupplierName());
        assertEquals("INV-1", actual.getInvoiceNumber());
        verify(provider).read(org.mockito.ArgumentMatchers.any());
        verify(outletMapper).findByIdAndVendor(700L, 70L);
    }

    @Test
    void scanMatchesSupplierAndProductsOnlyInsideAuthenticatedTenant() {
        ObjectProvider<InvoiceVisionService> vision = mock(ObjectProvider.class);
        InvoiceVisionService provider = mock(InvoiceVisionService.class);
        SupplierMapper suppliers = mock(SupplierMapper.class);
        ProductMapper products = mock(ProductMapper.class);
        OutletMapper outlets = mock(OutletMapper.class);
        setUser(70L, 700L);
        when(vision.getIfAvailable()).thenReturn(provider);
        when(outlets.findByIdAndVendor(700L, 70L)).thenReturn(new Outlet());
        when(suppliers.findMatchesByNameOrAbnForVendor("Acme", null, 70L))
                .thenReturn(java.util.List.of(new Supplier()));
        when(products.findActiveByExactNameForVendor("Water", 70L))
                .thenReturn(java.util.List.of(new com.orithos.modules.product.Product()));
        when(provider.read(org.mockito.ArgumentMatchers.any())).thenReturn(new TaxInvoiceRead(
                "Acme", null, null, "INV-2", null, null, null, null, null,
                null, null, null, null, null,
                java.util.List.of(new TaxInvoiceRead.Line("Water", null, null, null, null, null))));

        InvoiceScanResponse result = new InvoiceScanService(
                vision, suppliers, mock(SupplierService.class), products,
                mock(ProductService.class), outlets, mock(OrderService.class))
                .scan(new MockMultipartFile("file", "invoice.jpg", "image/jpeg", new byte[]{1}));

        assertFalse(result.getLines().getFirst().isCreateProduct());
        verify(suppliers).findMatchesByNameOrAbnForVendor("Acme", null, 70L);
        verify(products).findActiveByExactNameForVendor("Water", 70L);
        verifyNoMoreInteractions(suppliers, products);
    }

    @Test
    void scanRequiresAnAuthenticatedTenant() {
        ObjectProvider<InvoiceVisionService> vision = mock(ObjectProvider.class);
        InvoiceVisionService provider = mock(InvoiceVisionService.class);
        SupplierMapper suppliers = mock(SupplierMapper.class);
        OutletMapper outlets = mock(OutletMapper.class);
        when(vision.getIfAvailable()).thenReturn(provider);
        when(provider.read(org.mockito.ArgumentMatchers.any())).thenReturn(new TaxInvoiceRead(
                "Acme", null, null, null, null, null, null, null, null,
                null, null, null, null, null, java.util.List.of()));
        InvoiceScanService service = new InvoiceScanService(vision, suppliers,
                mock(SupplierService.class), mock(ProductMapper.class), mock(ProductService.class),
                outlets, mock(OrderService.class));

        assertThrows(BusinessException.class, () -> service.scan(
                new MockMultipartFile("file", "invoice.jpg", "image/jpeg", new byte[]{1})));
        verifyNoInteractions(suppliers, outlets);
    }

    @Test
    void scanFailsClosedWhenVisionProviderIsUnavailable() {
        ObjectProvider<InvoiceVisionService> vision = mock(ObjectProvider.class);
        when(vision.getIfAvailable()).thenReturn(null);
        InvoiceScanService service = new InvoiceScanService(
                vision, mock(SupplierMapper.class), mock(SupplierService.class),
                mock(ProductMapper.class), mock(ProductService.class),
                mock(OutletMapper.class), mock(OrderService.class));

        BusinessException error = assertThrows(BusinessException.class, () -> service.scan(
                new MockMultipartFile("file", "invoice.jpg", "image/jpeg", new byte[]{1})));

        assertEquals(50301, error.getCode());
        assertTrue(error.getMessage().contains("Invoice scan is disabled"));
    }

    @Test
    void scannedReceiveSaveFailsClosedWithoutCallingWriteDependencies() {
        ObjectProvider<InvoiceVisionService> vision = mock(ObjectProvider.class);
        SupplierMapper supplierMapper = mock(SupplierMapper.class);
        SupplierService supplierService = mock(SupplierService.class);
        ProductMapper productMapper = mock(ProductMapper.class);
        ProductService productService = mock(ProductService.class);
        OutletMapper outletMapper = mock(OutletMapper.class);
        OrderService orderService = mock(OrderService.class);

        InvoiceScanService service = new InvoiceScanService(
                vision,
                supplierMapper,
                supplierService,
                productMapper,
                productService,
                outletMapper,
                orderService);

        assertThrows(BusinessException.class, () -> service.save(new InvoiceScanResponse()));

        verifyNoInteractions(vision, supplierMapper, supplierService, productMapper,
                productService, outletMapper, orderService);
    }

    private static void setUser(Long vendorId, Long outletId) {
        var authentication = new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "test-user", true, outletId, vendorId), null);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
    }
}
