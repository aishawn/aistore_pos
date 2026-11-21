package com.orithos.modules.sale;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.payment.PaymentMethod;
import com.orithos.modules.payment.PaymentMethodMapper;
import com.orithos.modules.product.Product;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.modules.config.CompanySettingsKeys;
import com.orithos.modules.config.CompanySettingsService;
import com.orithos.modules.register.Register;
import com.orithos.modules.register.RegisterMapper;
import com.orithos.modules.register.RegisterSession;
import com.orithos.modules.register.RegisterSessionMapper;
import com.orithos.modules.sale.dto.RefundRequest;
import com.orithos.security.AuthUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RefundServiceTest {
    private final SaleMapper sales = mock(SaleMapper.class);
    private final SalePaymentMapper payments = mock(SalePaymentMapper.class);
    private final PaymentMethodMapper paymentMethods = mock(PaymentMethodMapper.class);
    private final ProductMapper products = mock(ProductMapper.class);
    private final RegisterMapper registers = mock(RegisterMapper.class);
    private final RegisterSessionMapper sessions = mock(RegisterSessionMapper.class);
    private final CompanySettingsService companySettings = mock(CompanySettingsService.class);
    private final RefundService service = new RefundService(sales, payments, paymentMethods,
            products, registers, sessions, companySettings, new ObjectMapper());

    @BeforeEach
    void authenticate() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "cashier", false, 12L, 3L), null, List.of()));
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void partialRefundUsesOriginalSaleValuesAndRestoresStock() {
        Sale original = originalSale();
        SaleItem line = originalLine();
        when(sales.lockForRefund(81L, 3L, 12L)).thenReturn(original);
        when(sales.findItemsBySaleId(81L)).thenReturn(List.of(line));
        when(sales.refundedQuantity(81L, 91L)).thenReturn(BigDecimal.ZERO, BigDecimal.ONE);
        when(sales.refundedLineAmount(81L, 91L)).thenReturn(BigDecimal.ZERO);
        when(sales.refundedLineTax(81L, 91L)).thenReturn(BigDecimal.ZERO);
        when(registers.findById(44L)).thenReturn(register());
        when(sessions.lockActiveSession(44L, 3L, 12L)).thenReturn(new RegisterSession());
        when(paymentMethods.findForRegisterByType(44L, 12L, "CASH")).thenReturn(cashMethod());
        when(products.findByIdAndOutlet(17L, 3L, 12L)).thenReturn(product());
        doAnswer(invocation -> {
            ((Sale) invocation.getArgument(0)).setId(501L);
            return 1;
        }).when(sales).insertRefund(any(Sale.class));
        doAnswer(invocation -> {
            ((SaleItem) invocation.getArgument(0)).setId(601L);
            return 1;
        }).when(sales).insertItem(any(SaleItem.class));

        var result = service.refund(81L, "refund-one", request("1"));

        assertEquals(new BigDecimal("5.00"), result.amount());
        assertEquals(new BigDecimal("0.46"), result.gst());
        assertEquals(new BigDecimal("5.00"), result.cashPaid());
        verify(products).adjustInventory(eq(17L), eq(12L), argThat(value -> value.compareTo(BigDecimal.ONE) == 0));
        verify(sales).insertRefundInventoryMovement(eq(3L), eq(12L), eq(17L), argThat(value -> value.compareTo(BigDecimal.ONE) == 0),
                eq(501L), eq(601L), eq("pos-refund:501:601"), eq(7L));
        verify(sales, never()).markRefunded(anyLong(), anyLong());
        verify(payments).insert(argThat(payment -> payment.getAmount().compareTo(new BigDecimal("-5.00")) == 0));
    }

    @Test
    void refundRetryReplaysTheOriginalResponseWithoutWritingAgain() throws Exception {
        RefundRequest request = request("1");
        when(sales.findCheckoutRequestHash(3L, "refund:refund-one")).thenReturn(null, requestHashFor(request));
        when(sales.lockForRefund(81L, 3L, 12L)).thenReturn(originalSale());
        when(sales.findItemsBySaleId(81L)).thenReturn(List.of(originalLine()));
        when(sales.refundedQuantity(81L, 91L)).thenReturn(BigDecimal.ZERO, BigDecimal.ONE);
        when(sales.refundedLineAmount(81L, 91L)).thenReturn(BigDecimal.ZERO);
        when(sales.refundedLineTax(81L, 91L)).thenReturn(BigDecimal.ZERO);
        when(registers.findById(44L)).thenReturn(register());
        when(sessions.lockActiveSession(44L, 3L, 12L)).thenReturn(new RegisterSession());
        when(paymentMethods.findForRegisterByType(44L, 12L, "CASH")).thenReturn(cashMethod());
        when(products.findByIdAndOutlet(17L, 3L, 12L)).thenReturn(product());
        doAnswer(invocation -> { ((Sale) invocation.getArgument(0)).setId(501L); return 1; })
                .when(sales).insertRefund(any(Sale.class));
        doAnswer(invocation -> { ((SaleItem) invocation.getArgument(0)).setId(601L); return 1; })
                .when(sales).insertItem(any(SaleItem.class));

        var first = service.refund(81L, "refund-one", request);
        ArgumentCaptor<String> responseCaptor = ArgumentCaptor.forClass(String.class);
        verify(sales).insertCheckoutResponse(eq(3L), eq("refund:refund-one"), anyString(), responseCaptor.capture());
        when(sales.findCheckoutResponse(3L, "refund:refund-one")).thenReturn(responseCaptor.getValue());
        var replay = service.refund(81L, "refund-one", request);

        assertEquals(first, replay);
        verify(sales, times(1)).insertRefund(any(Sale.class));
        verify(payments, times(1)).insert(any(SalePayment.class));
    }

    @Test
    void duplicateSourceLinesAreRejectedBeforeAnyLedgerWrite() {
        RefundRequest request = new RefundRequest(44L, "Customer return", List.of(
                new RefundRequest.Line(91L, BigDecimal.ONE), new RefundRequest.Line(91L, BigDecimal.ONE)));
        when(sales.findCheckoutRequestHash(3L, "refund:refund-one")).thenReturn(null);
        when(sales.lockForRefund(81L, 3L, 12L)).thenReturn(originalSale());
        when(registers.findById(44L)).thenReturn(register());
        when(sessions.lockActiveSession(44L, 3L, 12L)).thenReturn(new RegisterSession());
        when(paymentMethods.findForRegisterByType(44L, 12L, "CASH")).thenReturn(cashMethod());

        assertThrows(RuntimeException.class, () -> service.refund(81L, "refund-one", request));
        verify(sales, never()).insertRefund(any(Sale.class));
        verify(payments, never()).insert(any(SalePayment.class));
    }

    @Test
    void refundReasonMayBeBlankWhenCompanyPolicyDoesNotRequireIt() {
        when(companySettings.getBoolean(CompanySettingsKeys.REFUNDS_REQUIRE_REASON, true)).thenReturn(false);
        RefundRequest request = new RefundRequest(44L, "  ", List.of(
                new RefundRequest.Line(91L, BigDecimal.ONE)));
        prepareSingleRefund();

        service.refund(81L, "refund-no-reason", request);

        ArgumentCaptor<Sale> refund = ArgumentCaptor.forClass(Sale.class);
        verify(sales).insertRefund(refund.capture());
        assertEquals(81L, refund.getValue().getLinkedSaleId());
        assertNull(refund.getValue().getRefundReason());
    }

    @Test
    void refundReasonRemainsRequiredWhenCompanyPolicyRequiresIt() {
        when(companySettings.getBoolean(CompanySettingsKeys.REFUNDS_REQUIRE_REASON, true)).thenReturn(true);
        RefundRequest request = new RefundRequest(44L, "  ", List.of(
                new RefundRequest.Line(91L, BigDecimal.ONE)));

        assertThrows(RuntimeException.class, () -> service.refund(81L, "refund-reason-required", request));
        verify(sales, never()).insertRefund(any(Sale.class));
    }

    private void prepareSingleRefund() {
        when(sales.findCheckoutRequestHash(3L, "refund:refund-no-reason")).thenReturn(null);
        when(sales.lockForRefund(81L, 3L, 12L)).thenReturn(originalSale());
        when(sales.findItemsBySaleId(81L)).thenReturn(List.of(originalLine()));
        when(sales.refundedQuantity(81L, 91L)).thenReturn(BigDecimal.ZERO);
        when(sales.refundedLineAmount(81L, 91L)).thenReturn(BigDecimal.ZERO);
        when(sales.refundedLineTax(81L, 91L)).thenReturn(BigDecimal.ZERO);
        when(registers.findById(44L)).thenReturn(register());
        when(sessions.lockActiveSession(44L, 3L, 12L)).thenReturn(new RegisterSession());
        when(paymentMethods.findForRegisterByType(44L, 12L, "CASH")).thenReturn(cashMethod());
        when(products.findByIdAndOutlet(17L, 3L, 12L)).thenReturn(product());
        doAnswer(invocation -> { ((Sale) invocation.getArgument(0)).setId(501L); return 1; })
                .when(sales).insertRefund(any(Sale.class));
        doAnswer(invocation -> { ((SaleItem) invocation.getArgument(0)).setId(601L); return 1; })
                .when(sales).insertItem(any(SaleItem.class));
    }

    private String requestHashFor(RefundRequest request) {
        try {
            var field = RefundService.class.getDeclaredMethod("requestHash", Long.class, RefundRequest.class, String.class);
            field.setAccessible(true);
            return (String) field.invoke(service, 81L, request, "Customer return");
        } catch (Exception e) { throw new AssertionError(e); }
    }

    private static RefundRequest request(String quantity) {
        return new RefundRequest(44L, "Customer return", List.of(
                new RefundRequest.Line(91L, new BigDecimal(quantity))));
    }

    private static Sale originalSale() {
        Sale sale = new Sale();
        sale.setId(81L); sale.setStatus("COMPLETED"); sale.setTotalPrice(new BigDecimal("10.00"));
        sale.setOutstanding(BigDecimal.ZERO); sale.setOutletId(12L); sale.setCustomerId(5L);
        return sale;
    }

    private static SaleItem originalLine() {
        SaleItem item = new SaleItem();
        item.setId(91L); item.setSaleId(81L); item.setProductId(17L); item.setOutletId(12L);
        item.setQuantity(new BigDecimal("2.0000")); item.setTotalPrice(new BigDecimal("10.00"));
        item.setTax(new BigDecimal("0.91")); item.setBasePrice(new BigDecimal("5.00"));
        item.setCaseQuantity(new BigDecimal("6")); item.setTaxRateId(2L); item.setNote("Wine");
        return item;
    }

    private static Register register() {
        Register register = new Register(); register.setId(44L); register.setOutletId(12L); register.setClosed(false); return register;
    }

    private static PaymentMethod cashMethod() {
        PaymentMethod method = new PaymentMethod(); method.setId(8L); method.setName("Cash"); method.setType("CASH"); return method;
    }

    private static Product product() {
        Product product = new Product(); product.setId(17L); product.setTrackInventory(true); return product;
    }
}
