package com.orithos.modules.ai.invoice;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.modules.ai.AiProviderQuotaService;
import com.orithos.modules.ai.report.TenantContextFactory;
import com.orithos.security.AuthUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AiInvoicePreviewControllerTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void unauthenticatedPreviewStopsBeforeLoadingVisionService() {
        @SuppressWarnings("unchecked")
        ObjectProvider<InvoiceVisionService> provider = mock(ObjectProvider.class);
        AiInvoicePreviewController controller = new AiInvoicePreviewController(provider);

        BusinessException error = assertThrows(BusinessException.class,
                () -> controller.preview(new MockMultipartFile("file", "invoice.jpg", "image/jpeg", new byte[]{1})));

        assertEquals(40100, error.getCode());
        verifyNoInteractions(provider);
    }

    @Test
    void nonAdminPreviewStopsBeforeCallingVisionService() {
        @SuppressWarnings("unchecked")
        ObjectProvider<InvoiceVisionService> provider = mock(ObjectProvider.class);
        AiInvoicePreviewController controller = new AiInvoicePreviewController(provider);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "clerk", false, 1L, 2L), null, List.of()));

        BusinessException error = assertThrows(BusinessException.class,
                () -> controller.preview(new MockMultipartFile("file", "invoice.jpg", "image/jpeg", new byte[]{1})));

        assertEquals(40300, error.getCode());
        verifyNoInteractions(provider);
    }

    @Test
    void adminPreviewReturnsExtractedFieldsWithoutRecordMatching() {
        @SuppressWarnings("unchecked")
        ObjectProvider<InvoiceVisionService> provider = mock(ObjectProvider.class);
        InvoiceVisionService vision = mock(InvoiceVisionService.class);
        MockMultipartFile file = new MockMultipartFile("file", "invoice.jpg", "image/jpeg", new byte[]{1});
        TaxInvoiceRead extracted = new TaxInvoiceRead(
                "Example Supplier", "12 345 678 901", "example.test", "INV-42",
                LocalDate.of(2026, 10, 19), "Orithos", "Adelaide", null, null,
                BigDecimal.ZERO, new BigDecimal("34.80"), new BigDecimal("382.80"), new BigDecimal("18"), null,
                List.of(new TaxInvoiceRead.Line("Shiraz", "Example", new BigDecimal("6"), new BigDecimal("2"),
                        new BigDecimal("110"), new BigDecimal("220"))));
        InvoiceVisionService.PreparedInvoiceImage prepared = new InvoiceVisionService.PreparedInvoiceImage(
                "image/jpeg", new byte[]{1});
        when(provider.getIfAvailable()).thenReturn(vision);
        when(vision.prepare(file)).thenReturn(prepared);
        when(vision.readPrepared(prepared)).thenReturn(extracted);
        AiInvoicePreviewController controller = new AiInvoicePreviewController(provider);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "admin", true, 1L, 2L), null, List.of()));

        ApiResult<InvoiceScanResponse> result = controller.preview(file);

        assertEquals(0, result.code());
        assertEquals("Example Supplier", result.data().getSupplierName());
        assertEquals("12 345 678 901", result.data().getSupplierAbn());
        assertEquals("INV-42", result.data().getInvoiceNumber());
        assertEquals(LocalDate.of(2026, 10, 19), result.data().getInvoiceDate());
        assertEquals(1, result.data().getLines().size());
        assertEquals("Shiraz", result.data().getLines().get(0).getDescription());
        assertNull(result.data().getSupplierId());
        assertNull(result.data().getToId());
        assertNull(result.data().getLines().get(0).getProductId());
        verify(vision).readPrepared(prepared);
    }

    @Test
    void unusableImageIsRejectedBeforeProviderQuotaIsReserved() {
        @SuppressWarnings("unchecked")
        ObjectProvider<InvoiceVisionService> provider = mock(ObjectProvider.class);
        InvoiceVisionService vision = mock(InvoiceVisionService.class);
        AiProviderQuotaService quota = mock(AiProviderQuotaService.class);
        TenantContextFactory tenantContextFactory = mock(TenantContextFactory.class);
        MockMultipartFile file = new MockMultipartFile("file", "invalid.png", "image/png", new byte[]{1, 2, 3});
        when(provider.getIfAvailable()).thenReturn(vision);
        when(vision.prepare(file)).thenThrow(new BusinessException(40013, "Invalid image"));
        AiInvoicePreviewController controller = new AiInvoicePreviewController(provider, tenantContextFactory, quota);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "admin", true, 1L, 2L), null, List.of()));

        BusinessException error = assertThrows(BusinessException.class, () -> controller.preview(file));

        assertEquals(40013, error.getCode());
        verifyNoInteractions(quota, tenantContextFactory);
        verify(vision, never()).readPrepared(any(InvoiceVisionService.PreparedInvoiceImage.class));
    }
}
