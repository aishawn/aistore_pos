package com.orithos.modules.ai.invoice;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.security.AuthUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class InvoiceScanSessionServiceTest {

    private InvoiceScanSessionMapper mapper;
    private InvoiceScanSessionService service;

    @BeforeEach
    void setUp() {
        mapper = mock(InvoiceScanSessionMapper.class);
        service = new InvoiceScanSessionService(mapper, new ObjectMapper());
        AuthUser admin = new AuthUser(9L, "admin", true, 1L, 42L);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(admin, null, List.of()));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void createPersistsDraftAndLines() {
        when(mapper.insert(any(InvoiceScanSessionEntity.class))).thenAnswer(invocation -> {
            InvoiceScanSessionEntity session = invocation.getArgument(0);
            session.setId(11L);
            return 1;
        });
        InvoiceScanSessionEntity stored = new InvoiceScanSessionEntity();
        stored.setId(11L);
        stored.setVendorId(42L);
        stored.setStatus("draft");
        stored.setInvoiceNumber("INV-1");
        when(mapper.findOwned(11L, 42L)).thenReturn(stored);
        when(mapper.listLines(11L)).thenReturn(List.of());
        when(mapper.findDuplicateIds(anyLong(), any(), any(), any())).thenReturn(List.of());

        InvoiceScanSessionDtos.SaveRequest request = new InvoiceScanSessionDtos.SaveRequest();
        request.setReviewConfirmed(true);
        request.setSourceType("pdf");
        request.setInvoiceNumber("INV-1");
        request.setSupplierName("Acme");
        InvoiceScanSessionDtos.LineInput line = new InvoiceScanSessionDtos.LineInput();
        line.setDescription("Shiraz 12x750");
        line.setQtyCases(new BigDecimal("2"));
        request.setLines(List.of(line));

        InvoiceScanSessionDtos.SessionView view = service.create(request);
        assertEquals(11L, view.getId());

        ArgumentCaptor<InvoiceScanLineEntity> lineCaptor = ArgumentCaptor.forClass(InvoiceScanLineEntity.class);
        verify(mapper).insertLine(lineCaptor.capture());
        assertEquals("Shiraz 12x750", lineCaptor.getValue().getDescription());
        assertEquals("unmatched", lineCaptor.getValue().getMatchStatus());
    }

    @Test
    void createRejectsDraftWithoutExplicitReviewConfirmation() {
        InvoiceScanSessionDtos.SaveRequest request = new InvoiceScanSessionDtos.SaveRequest();
        request.setSupplierName("Synthetic Test Supplier");

        BusinessException error = assertThrows(BusinessException.class, () -> service.create(request));

        assertEquals(40010, error.getCode());
        org.mockito.Mockito.verify(mapper, org.mockito.Mockito.never()).insert(any(InvoiceScanSessionEntity.class));
    }

    @Test
    void discardRejectsPoCreated() {
        InvoiceScanSessionEntity stored = new InvoiceScanSessionEntity();
        stored.setId(5L);
        stored.setVendorId(42L);
        stored.setStatus("po_created");
        when(mapper.findOwned(5L, 42L)).thenReturn(stored);

        BusinessException error = assertThrows(BusinessException.class, () -> service.discard(5L));
        assertEquals(40020, error.getCode());
    }

    @Test
    void linkPurchaseAllowsFailedWithoutPo() {
        InvoiceScanSessionEntity stored = new InvoiceScanSessionEntity();
        stored.setId(7L);
        stored.setVendorId(42L);
        stored.setStatus("draft");
        when(mapper.findOwned(eq(7L), eq(42L))).thenReturn(stored);
        when(mapper.listLines(7L)).thenReturn(List.of());

        InvoiceScanSessionDtos.LinkPurchaseRequest request = new InvoiceScanSessionDtos.LinkPurchaseRequest();
        request.setStatus("failed");
        service.linkPurchase(7L, request);
        verify(mapper).update(any(InvoiceScanSessionEntity.class));
    }
}
