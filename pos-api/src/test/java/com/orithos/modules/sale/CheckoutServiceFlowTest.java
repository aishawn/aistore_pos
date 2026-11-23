package com.orithos.modules.sale;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.orithos.common.BusinessException;
import com.orithos.modules.config.CompanySettingsService;
import com.orithos.modules.eftpos.EftposService;
import com.orithos.modules.payment.PaymentMethod;
import com.orithos.modules.payment.PaymentMethodMapper;
import com.orithos.modules.product.Product;
import com.orithos.modules.product.ProductPrice;
import com.orithos.modules.product.ShopfrontProductOfferService;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.modules.register.Register;
import com.orithos.modules.register.RegisterMapper;
import com.orithos.modules.register.RegisterSession;
import com.orithos.modules.register.RegisterSessionMapper;
import com.orithos.modules.sale.dto.CheckoutRequest;
import com.orithos.security.AuthUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CheckoutServiceFlowTest {
    private final SaleMapper sales = mock(SaleMapper.class);
    private final SalePaymentMapper payments = mock(SalePaymentMapper.class);
    private final PaymentMethodMapper paymentMethods = mock(PaymentMethodMapper.class);
    private final ProductMapper products = mock(ProductMapper.class);
    private final RegisterMapper registers = mock(RegisterMapper.class);
    private final RegisterSessionMapper sessions = mock(RegisterSessionMapper.class);
    private final CompanySettingsService companySettings = mock(CompanySettingsService.class);
    private CheckoutService service;
    private Product product;
    private RegisterSession session;
    private SaleItem saleLine;

    @BeforeEach
    void setUp() {
        when(companySettings.cashRoundTo(3L)).thenReturn(new BigDecimal("0.05"));
        service = new CheckoutService(sales, payments, paymentMethods, products, registers, sessions,
                new ObjectMapper().registerModule(new JavaTimeModule()), companySettings, mock(EftposService.class));
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "cashier", false, 12L, 3L), null, List.of()));

        product = new Product();
        product.setId(42L);
        product.setName("Outlet wine");
        product.setPrice(new BigDecimal("10.02"));
        product.setCaseQuantity(BigDecimal.ONE);
        product.setTrackInventory(true);
        ProductPrice price = new ProductPrice();
        price.setQuantity(BigDecimal.ONE);
        price.setPrice(product.getPrice());
        when(products.findPricesForOutlet(42L, 12L)).thenReturn(List.of(price));
        when(products.findSellableForOutlet(42L, 3L, 12L, BigDecimal.ONE)).thenReturn(product);
        when(products.findByIdAndOutlet(42L, 3L, 12L)).thenReturn(product);
        when(sales.findTaxRateId(42L, 3L, 12L)).thenReturn(9L);
        when(sales.findSellTaxPercent(42L, 3L, 12L)).thenReturn(new BigDecimal("10"));

        Register register = new Register();
        register.setId(99L);
        register.setOutletId(12L);
        register.setClosed(false);
        when(registers.findById(99L)).thenReturn(register);
        session = new RegisterSession();
        when(sessions.lockActiveSession(99L, 3L, 12L)).thenReturn(session);

        PaymentMethod cash = new PaymentMethod();
        cash.setId(5L);
        cash.setName("Cash");
        cash.setType("CASH");
        when(paymentMethods.findForRegisterByType(99L, 12L, "CASH")).thenReturn(cash);
        when(sales.insert(any(Sale.class))).thenAnswer(call -> {
            ((Sale) call.getArgument(0)).setId(81L);
            return 1;
        });
        when(sales.insertItem(any(SaleItem.class))).thenAnswer(call -> {
            ((SaleItem) call.getArgument(0)).setId(91L);
            return 1;
        });
        saleLine = new SaleItem();
        saleLine.setId(91L);
        saleLine.setSaleId(81L);
        saleLine.setOutletId(12L);
        saleLine.setProductId(42L);
        saleLine.setQuantity(BigDecimal.ONE);
        saleLine.setBasePrice(new BigDecimal("10.02"));
        saleLine.setTotalPrice(new BigDecimal("10.02"));
        saleLine.setTax(new BigDecimal("0.91"));
        when(sales.findItemsBySaleId(81L)).thenReturn(List.of(saleLine));
        when(products.adjustInventoryIfAvailable(42L, 12L, new BigDecimal("-1"))).thenReturn(1);
        when(sales.insertCheckoutResponse(eq(3L), anyString(), anyString(), anyString())).thenReturn(1);
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void cashCheckoutPersistsTheQuotedOfferAndRequotesIfItExpires() {
        var offers = mock(ShopfrontProductOfferService.class);
        service = new CheckoutService(sales, payments, paymentMethods, products, registers, sessions,
                new ObjectMapper().registerModule(new JavaTimeModule()), companySettings, null,
                mock(EftposService.class), offers);
        var offer = new ShopfrontProductOfferService.Offer("Fixture promotion", BigDecimal.ONE,
                new BigDecimal("9.00"), null, null, java.time.Instant.now());
        var matching = new ShopfrontProductOfferService.CheckoutOffers(java.util.Map.of(42L, List.of(offer)), false);
        when(offers.checkoutOffers(eq(3L), eq(12L), any()))
                .thenReturn(matching, new ShopfrontProductOfferService.CheckoutOffers(java.util.Map.of(), true), matching);
        when(sessions.findActiveSession(99L, 3L, 12L)).thenReturn(session);

        var quote = service.quote(cashRequest("9.00"));
        assertEquals(new BigDecimal("9.00"), quote.total());
        assertEquals(new BigDecimal("0.82"), quote.gst());

        var expired = cashRequest("9.00");
        expired.setExpectedTotal(quote.total());
        expired.setExpectedGst(quote.gst());
        assertThrows(BusinessException.class, () -> service.checkout(expired, "expired-offer"));
        verify(sales, never()).insert(any(Sale.class));
        verify(payments, never()).insert(any(SalePayment.class));

        var valid = cashRequest("9.00");
        valid.setExpectedTotal(quote.total());
        valid.setExpectedGst(quote.gst());
        saleLine.setTotalPrice(quote.total());
        saleLine.setTax(quote.gst());
        assertTrue(service.checkout(valid, "valid-offer").isCompleted());

        var persisted = org.mockito.ArgumentCaptor.forClass(SaleItem.class);
        verify(sales).insertItem(persisted.capture());
        assertEquals(quote.total(), persisted.getValue().getTotalPrice());
        assertEquals(quote.gst(), persisted.getValue().getTax());
        verify(payments).insert(any(SalePayment.class));
        verify(products).adjustInventoryIfAvailable(42L, 12L, BigDecimal.ONE.negate());
    }

    @Test
    void cashSaleRoundsToFiveCentsReturnsChangeAndDeductsStockOnce() {
        CheckoutRequest request = cashRequest("10.05");

        var result = service.checkout(request, "cash-sale-1");

        assertTrue(result.isCompleted());
        assertEquals(new BigDecimal("10.00"), result.getCashDue());
        assertEquals(new BigDecimal("0.05"), result.getChange());
        assertEquals(new BigDecimal("10.02"), result.getTendered());
        assertEquals(new BigDecimal("-0.02"), result.getRounding());
        verify(products).adjustInventoryIfAvailable(42L, 12L, new BigDecimal("-1"));
        verify(sales).insertSaleInventoryMovement(3L, 12L, 42L, new BigDecimal("-1"),
                81L, 91L, "pos-sale:81:91", 7L);
    }

    @Test
    void retryWithSameIdempotencyKeyReplaysWithoutDuplicatePaymentOrStockMovement() throws Exception {
        CheckoutRequest request = cashRequest("10.05");
        String requestHash = service.requestHash(request);
        var first = service.checkout(request, "cash-sale-2");
        org.mockito.ArgumentCaptor<String> response = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(sales).insertCheckoutResponse(eq(3L), eq("cash-sale-2"), eq(requestHash), response.capture());
        when(sales.findCheckoutRequestHash(3L, "cash-sale-2")).thenReturn(requestHash);
        when(sales.findCheckoutResponse(3L, "cash-sale-2")).thenReturn(response.getValue());

        var replay = service.checkout(request, "cash-sale-2");

        assertEquals(first.getSaleId(), replay.getSaleId());
        verify(payments, times(1)).insert(any(SalePayment.class));
        verify(products, times(1)).adjustInventoryIfAvailable(42L, 12L, new BigDecimal("-1"));
        verify(sales, times(1)).insertSaleInventoryMovement(anyLong(), anyLong(), anyLong(), any(), anyLong(), anyLong(), anyString(), anyLong());
    }

    @Test
    void idempotencyHashChangesWhenQuotedUnitPriceChanges() {
        CheckoutRequest original = cashRequest("10.05");
        CheckoutRequest changedQuote = cashRequest("10.05");
        changedQuote.getItems().get(0).setUnitPrice(new BigDecimal("9.02"));

        assertNotEquals(service.requestHash(original), service.requestHash(changedQuote));
    }

    @Test
    void lineDiscountIsAppliedToServerCalculatedTotal() {
        CheckoutRequest.Item item = new CheckoutRequest.Item();
        item.setProductId(42L);
        item.setQuantity(new BigDecimal("2"));
        item.setUnitPrice(new BigDecimal("10.00"));
        item.setDiscountPercent(new BigDecimal("10"));
        when(products.findSellableForOutlet(42L, 3L, 12L, new BigDecimal("2"))).thenReturn(product);
        CheckoutRequest request = new CheckoutRequest();
        request.setItems(List.of(item));
        service.prepareSellItems(request, 3L, 12L);

        assertEquals(new BigDecimal("18.04"), CheckoutService.calculateTotal(List.of(item)));
    }

    @Test
    void configuredDiscountReasonRequirementRejectsDiscountWithoutReason() {
        when(companySettings.getBoolean("company.sell.discounts_require_reason", false)).thenReturn(true);
        CheckoutRequest request = cashRequest("10.05");
        request.getItems().get(0).setDiscountPercent(new BigDecimal("5"));

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.prepareSellItems(request, 3L, 12L));

        assertTrue(error.getMessage().contains("discount reason"));
        verify(sales, never()).insert(any(Sale.class));
    }

    @Test
    void configuredDiscountReasonIsStoredOnTheSaleLine() {
        when(companySettings.getBoolean("company.sell.discounts_require_reason", false)).thenReturn(true);
        CheckoutRequest request = cashRequest("9.55");
        request.setExpectedTotal(new BigDecimal("9.52"));
        request.setExpectedGst(new BigDecimal("0.87"));
        request.getItems().get(0).setDiscountPercent(new BigDecimal("5"));
        request.getItems().get(0).setDiscountReason("Manager approval");

        service.checkout(request, "cash-discount-reason");

        org.mockito.ArgumentCaptor<SaleItem> line = org.mockito.ArgumentCaptor.forClass(SaleItem.class);
        verify(sales).insertItem(line.capture());
        assertEquals("Manager approval", line.getValue().getDiscountReason());
    }

    @Test
    void customerWithAssignedPriceListCannotBeQuotedAtBasePrice() {
        CheckoutRequest request = new CheckoutRequest();
        request.setCustomerId(77L);
        request.setItems(List.of(new CheckoutRequest.Item()));
        when(sales.customerHasAssignedPriceList(77L, 12L)).thenReturn(1);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.prepareSellItems(request, 3L, 12L));

        assertTrue(error.getMessage().contains("Customer-specific pricing is not yet supported"));
        verify(products, never()).findSellableForOutlet(anyLong(), anyLong(), anyLong(), any());
    }

    @Test
    void discountedSalePersistsHeaderAndLineSavings() {
        CheckoutRequest request = cashRequest("9.05");
        request.setExpectedTotal(new BigDecimal("9.02"));
        request.setExpectedGst(new BigDecimal("0.82"));
        request.getItems().get(0).setDiscountPercent(new BigDecimal("10"));

        service.checkout(request, "cash-discount-1");

        org.mockito.ArgumentCaptor<Sale> sale = org.mockito.ArgumentCaptor.forClass(Sale.class);
        org.mockito.ArgumentCaptor<SaleItem> line = org.mockito.ArgumentCaptor.forClass(SaleItem.class);
        verify(sales).insert(sale.capture());
        verify(sales).insertItem(line.capture());
        assertEquals(new BigDecimal("9.02"), sale.getValue().getTotalPrice());
        assertEquals(new BigDecimal("1.00"), sale.getValue().getTotalDiscount());
        assertEquals(new BigDecimal("1.00"), line.getValue().getSavings());
    }

    @Test
    void productConfiguredToPreventManualDiscountsRejectsCheckout() {
        product.setPreventManualDiscounts(true);
        CheckoutRequest request = cashRequest("10.05");
        request.getItems().get(0).setDiscountPercent(new BigDecimal("5"));

        assertThrows(BusinessException.class, () -> service.checkout(request, "discount-blocked"));

        verify(sales, never()).insert(any(Sale.class));
    }

    @Test
    void giftCardTenderIsRejectedWhileGiftCardLedgerIsUnavailable() {
        CheckoutRequest request = cashRequest("10.05");
        request.setTender("Gift Card");
        request.setTendered(new BigDecimal("10.02"));
        PaymentMethod giftCard = new PaymentMethod();
        giftCard.setId(6L);
        giftCard.setName("Gift Card");
        giftCard.setType("GIFT_CARD");
        when(paymentMethods.findForRegisterByType(99L, 12L, "GIFT_CARD")).thenReturn(giftCard);

        assertThrows(BusinessException.class, () -> service.checkout(request, "gift-card-disabled"));

        verify(payments, never()).insert(any(SalePayment.class));
    }

    @Test
    void splitCashPaymentLeavesStockUntouchedUntilTheBalanceIsSettled() {
        CheckoutRequest first = cashRequest("5.00");

        var partial = service.checkout(first, "cash-split-1");

        assertFalse(partial.isCompleted());
        assertEquals(new BigDecimal("5.02"), partial.getRemaining());
        verify(products, never()).adjustInventoryIfAvailable(anyLong(), anyLong(), any());

        Sale pending = new Sale();
        pending.setId(81L);
        pending.setStatus("PENDING");
        pending.setOutletId(12L);
        pending.setRegisterId(99L);
        pending.setTotalPrice(new BigDecimal("10.02"));
        pending.setTotalTax(new BigDecimal("0.91"));
        pending.setOutstanding(new BigDecimal("5.02"));
        pending.setItems(List.of(saleLine));
        when(sales.findById(81L, 3L, 12L)).thenReturn(pending);
        CheckoutRequest second = new CheckoutRequest();
        second.setSaleId(81L);
        second.setRegisterId(99L);
        second.setTender("Exact Cash");
        second.setTendered(new BigDecimal("5.05"));

        var settled = service.checkout(second, "cash-split-2");

        assertTrue(settled.isCompleted());
        assertEquals(new BigDecimal("0.05"), settled.getChange());
        verify(products).adjustInventoryIfAvailable(42L, 12L, new BigDecimal("-1"));
    }

    @Test
    void insufficientStockRejectsCompletionBeforeWritingInventoryMovement() {
        when(products.adjustInventoryIfAvailable(42L, 12L, new BigDecimal("-1"))).thenReturn(0);

        assertThrows(BusinessException.class, () -> service.checkout(cashRequest("10.05"), "cash-no-stock"));

        verify(sales, never()).insertSaleInventoryMovement(anyLong(), anyLong(), anyLong(), any(), anyLong(), anyLong(), anyString(), anyLong());
        verify(sales, never()).markStockApplied(anyLong(), anyLong());
    }

    private CheckoutRequest cashRequest(String tendered) {
        CheckoutRequest.Item item = new CheckoutRequest.Item();
        item.setProductId(42L);
        item.setQuantity(BigDecimal.ONE);
        item.setUnitPrice(new BigDecimal("10.02"));
        item.setExpectedTaxRate(new BigDecimal("10"));
        CheckoutRequest request = new CheckoutRequest();
        request.setRegisterId(99L);
        request.setTender("Exact Cash");
        request.setTendered(new BigDecimal(tendered));
        request.setExpectedTotal(new BigDecimal("10.02"));
        request.setExpectedGst(new BigDecimal("0.91"));
        request.setItems(List.of(item));
        return request;
    }

}
