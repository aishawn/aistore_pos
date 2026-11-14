package com.orithos.modules.register;

import com.orithos.common.BusinessException;
import com.orithos.security.AuthUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RegisterSessionServiceTest {
    private final RegisterSessionMapper sessions = mock(RegisterSessionMapper.class);
    private final RegisterClosureMapper closures = mock(RegisterClosureMapper.class);
    private final RegisterSessionService service = new RegisterSessionService(sessions, closures);

    @BeforeEach
    void authenticate() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "cashier", false, 12L, 3L), null, List.of()));
    }

    @AfterEach
    void clearAuthentication() { SecurityContextHolder.clearContext(); }

    @Test
    void openIsIdempotentAndScopedToAuthenticatedOutlet() {
        Register register = new Register(); register.setId(11L); register.setOutletId(12L);
        when(sessions.lockRegister(11L, 3L, 12L)).thenReturn(register);
        when(sessions.findOpenReplay(11L, "open-1")).thenReturn(null);
        when(sessions.lockActiveSession(11L, 3L, 12L)).thenReturn(null);
        when(sessions.insertSession(any())).thenAnswer(invocation -> {
            ((RegisterSession) invocation.getArgument(0)).setId(41L);
            return 1;
        });

        RegisterSession opened = service.open(11L, "open-1", new BigDecimal("100.00"));
        assertEquals(41L, opened.getId());
        assertEquals(new BigDecimal("100.00"), opened.getOpeningFloat());

        when(sessions.findOpenReplay(11L, "open-1")).thenReturn(opened);
        assertSame(opened, service.open(11L, "open-1", new BigDecimal("100.00")));
        verify(sessions, times(1)).insertSession(any());
    }

    @Test
    void cannotOpenRegisterFromAnotherOutlet() {
        when(sessions.lockRegister(99L, 3L, 12L)).thenReturn(null);
        assertThrows(BusinessException.class,
                () -> service.open(99L, "open-other", BigDecimal.ZERO));
        verify(sessions, never()).insertSession(any());
    }

    @Test
    void summaryUsesTheAuthenticatedOutletAndSeparatesDrawerCashFromNonCashTenders() {
        LocalDateTime openedAt = LocalDateTime.of(2026, 11, 9, 9, 0);
        Register register = new Register(); register.setId(11L); register.setOutletId(12L);
        RegisterSession session = new RegisterSession();
        session.setId(41L); session.setOutletId(12L); session.setRegisterId(11L);
        session.setOpenedAt(openedAt); session.setOpeningFloat(new BigDecimal("100.00"));
        when(sessions.findRegister(11L, 3L, 12L)).thenReturn(register);
        when(sessions.findActiveSession(11L, 3L, 12L)).thenReturn(session);
        when(sessions.sumCashMovements(41L, 3L, 12L)).thenReturn(new BigDecimal("5.00"));
        when(sessions.cashSalesNetOfChange(eq(11L), eq(12L), eq(openedAt), any())).thenReturn(new BigDecimal("90.00"));
        when(sessions.tenderTotals(eq(11L), eq(12L), eq(openedAt), any())).thenReturn(List.of(
                tender(1L, "CASH", "100.00"), tender(2L, "CARD", "55.00")));
        when(sessions.countSessionSales(eq(11L), eq(12L), eq(openedAt), any())).thenReturn(2);
        when(sessions.countUnsettledSales(eq(11L), eq(12L), eq(openedAt), any())).thenReturn(0);
        when(sessions.countUnmappedPayments(eq(11L), eq(12L), eq(openedAt), any())).thenReturn(0);

        RegisterSessionSummary summary = service.summary(11L);
        assertEquals(new BigDecimal("195.00"), summary.expectedCash());
        assertEquals(2, summary.transactionCount());
        assertEquals(1, summary.tenders().size());
        assertEquals(2L, summary.tenders().getFirst().paymentMethodId());
        assertEquals(new BigDecimal("55.00"), summary.tenders().getFirst().expectedAmount());
        verify(sessions).findRegister(11L, 3L, 12L);
    }

    @Test
    void closeReconcilesFloatCashRoundingAndCardCashoutAndReplaysExactRequest() {
        LocalDateTime openedAt = LocalDateTime.of(2026, 11, 9, 9, 0);
        Register register = new Register(); register.setId(11L); register.setOutletId(12L);
        RegisterSession session = new RegisterSession();
        session.setId(41L); session.setVendorId(3L); session.setOutletId(12L); session.setRegisterId(11L);
        session.setOpenedAt(openedAt); session.setOpeningFloat(new BigDecimal("100.00"));
        when(sessions.findCloseReplay(11L, 3L, 12L, "close-1")).thenReturn(null, session);
        when(sessions.lockRegister(11L, 3L, 12L)).thenReturn(register);
        when(sessions.lockActiveSession(11L, 3L, 12L)).thenReturn(session);
        when(sessions.countUnmappedPayments(eq(11L), eq(12L), eq(openedAt), any())).thenReturn(0);
        RegisterTenderLine cash = tender(1L, "CASH", "100.00");
        RegisterTenderLine card = tender(2L, "CARD", "55.00");
        when(sessions.tenderTotals(eq(11L), eq(12L), eq(openedAt), any())).thenReturn(List.of(cash, card));
        when(sessions.sumCashMovements(41L, 3L, 12L)).thenReturn(new BigDecimal("5.00"));
        when(sessions.cashSalesNetOfChange(eq(11L), eq(12L), eq(openedAt), any())).thenReturn(new BigDecimal("90.00"));
        when(sessions.countSessionSales(eq(11L), eq(12L), eq(openedAt), any())).thenReturn(2);
        when(sessions.countUnsettledSales(eq(11L), eq(12L), eq(openedAt), any())).thenReturn(0);
        when(closures.insert(any())).thenAnswer(invocation -> {
            ((RegisterClosure) invocation.getArgument(0)).setId(81L);
            return 1;
        });
        when(closures.findPaymentsByClosureId(81L)).thenReturn(List.of());
        when(sessions.closeSession(session)).thenReturn(1);
        RegisterClosure stored = new RegisterClosure(); stored.setId(81L);
        when(closures.findByIdUnscoped(81L)).thenReturn(stored);

        Map<Long, BigDecimal> counted = Map.of(2L, new BigDecimal("55.00"));
        RegisterClosure result = service.close(11L, "close-1", new BigDecimal("190.00"), counted, null);
        assertEquals(new BigDecimal("250.00"), result.getTotalExpected());
        assertEquals(new BigDecimal("245.00"), result.getTotalReceived());
        assertEquals(new BigDecimal("-5.00"), result.getMovement());
        assertEquals(2, result.getTotalTransactions());
        verify(closures, times(2)).insertPayment(any());
        assertSame(stored, service.close(11L, "close-1", new BigDecimal("190.00"), counted, null));
        assertThrows(BusinessException.class,
                () -> service.close(11L, "close-1", new BigDecimal("194.00"), counted, null));
    }

    @Test
    void closeIsBlockedWhileAnUnsettledSaleRemainsOpen() {
        LocalDateTime openedAt = LocalDateTime.of(2026, 11, 9, 9, 0);
        Register register = new Register(); register.setId(11L); register.setOutletId(12L);
        RegisterSession session = new RegisterSession();
        session.setId(41L); session.setVendorId(3L); session.setOutletId(12L); session.setRegisterId(11L);
        session.setOpenedAt(openedAt); session.setOpeningFloat(new BigDecimal("100.00"));
        when(sessions.lockRegister(11L, 3L, 12L)).thenReturn(register);
        when(sessions.lockActiveSession(11L, 3L, 12L)).thenReturn(session);
        when(sessions.countUnsettledSales(eq(11L), eq(12L), eq(openedAt), any())).thenReturn(1);

        assertThrows(BusinessException.class, () -> service.close(
                11L, "close-with-unpaid-sale", new BigDecimal("100.00"), Map.of(), null));

        verify(closures, never()).insert(any(RegisterClosure.class));
        verify(sessions, never()).closeSession(any(RegisterSession.class));
    }

    private static RegisterTenderLine tender(Long id, String type, String amount) {
        RegisterTenderLine line = new RegisterTenderLine();
        line.setPaymentMethodId(id); line.setPaymentMethodType(type); line.setAmount(new BigDecimal(amount));
        return line;
    }
}
