package com.orithos.modules.order;

import com.orithos.common.BusinessException;
import com.orithos.common.BusinessTimezoneService;
import com.orithos.modules.product.Product;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.modules.register.OutletMapper;
import com.orithos.modules.supplier.SupplierMapper;
import com.orithos.security.AuthUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class PurchaseReceiptServiceTest {
    private final OrderMapper orders = mock(OrderMapper.class);
    private final ProductMapper products = mock(ProductMapper.class);
    private final OrderService service = new OrderService(orders, mock(OutletMapper.class), mock(SupplierMapper.class),
            products, mock(BusinessTimezoneService.class));
    private final PurchaseReceiptRequest request = new PurchaseReceiptRequest(List.of(
            new PurchaseReceiptRequest.Line(71L, new BigDecimal("4"))));

    @BeforeEach
    void authenticateTenant() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(new AuthUser(9L, "buyer", false, 3L, 5L), null, List.of()));
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void expiryReviewUsesStoreBusinessDateAndAuthenticatedOutlet() {
        var zone = mock(BusinessTimezoneService.class);
        var permission = mock(com.orithos.security.PermissionAccess.class);
        var today = java.time.LocalDate.parse("2026-11-23");
        when(zone.today(5L)).thenReturn(today);
        when(orders.findExpiryReview(5L, 3L, null, today.plusDays(14), null, null, 0L)).thenReturn(List.of());
        var coverage = new ReceiptExpiryReviewController.Coverage(5, 3);
        when(orders.expiryReviewCoverage(5L, 3L)).thenReturn(coverage);
        var result = new ReceiptExpiryReviewController(orders, zone, permission).review(1, "all", "", "all").data();
        assertEquals(today, result.businessDate());
        assertEquals(today.plusDays(14), result.throughDate());
        assertEquals(coverage, result.coverage());
        verify(permission).requirePermission("stock.purchases");
        verify(orders).findExpiryReview(5L, 3L, null, today.plusDays(14), null, null, 0L);
    }

    @Test
    void expiryReviewPagesWithinTheSelectedDateRange() {
        var zone = mock(BusinessTimezoneService.class);
        var today = java.time.LocalDate.parse("2026-11-23");
        when(zone.today(5L)).thenReturn(today);
        var batch = new ReceiptExpiryReviewController.Batch(12L, 44L, 71L, "Milk", "A", today, BigDecimal.ONE, null);
        when(orders.findExpiryReview(5L, 3L, today, today.plusDays(14), "001234", "USE_BY", 100L))
                .thenReturn(java.util.Collections.nCopies(101, batch));
        var controller = new ReceiptExpiryReviewController(orders, zone, mock(com.orithos.security.PermissionAccess.class));

        var result = controller.review(2, "upcoming", " 001234 ", "USE_BY").data();
        assertEquals(2, result.page());
        assertEquals(100, result.batches().size());
        assertEquals(true, result.truncated());
        controller.review(1, "expired", " ", "all");
        verify(orders).findExpiryReview(5L, 3L, null, today.minusDays(1), null, null, 0L);
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> controller.review(0, "all", "", "all"));
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> controller.review(1, "unknown", "", "all"));
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> controller.review(1, "all", "", "INVALID"));
    }

    @Test
    void expiryReviewRejectsBarcodeLongerThanTheCatalogueColumn() throws Exception {
        var zone = mock(BusinessTimezoneService.class);
        when(zone.today(5L)).thenReturn(java.time.LocalDate.parse("2026-11-23"));
        var controller = new ReceiptExpiryReviewController(orders, zone, mock(com.orithos.security.PermissionAccess.class));
        var mvc = standaloneSetup(controller).build();

        mvc.perform(get("/api/orders/expiry-review").param("barcode", "0".repeat(129)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void orderDetailReadsReceivedBatchesFromTheAuthenticatedStore() {
        var controller = new OrderController(orders, service, null, null);
        Order order = order("RECEIVED");
        when(orders.findByIdForVendor(12L, 5L)).thenReturn(order);
        var batch = new Order.ReceivedBatch(44L, 71L, "L01", java.time.LocalDate.parse("2026-11-28"), new BigDecimal("6"), PurchaseReceiptRequest.DateType.BEST_BEFORE);
        when(orders.findReceivedBatches(12L, 5L, 3L)).thenReturn(List.of(batch));

        assertEquals(List.of(batch), controller.get(12L).data().getReceivedBatches());
    }

    @Test
    void recordsPartialReceiptAndInventoryMovementAtomicallyThroughService() {
        var expiry = java.time.LocalDate.parse("2026-11-30");
        var request = new PurchaseReceiptRequest(List.of(new PurchaseReceiptRequest.Line(71L, new BigDecimal("4"),
                List.of(new PurchaseReceiptRequest.Batch("A", expiry, new BigDecimal("1"), PurchaseReceiptRequest.DateType.USE_BY),
                        new PurchaseReceiptRequest.Batch("B", expiry, new BigDecimal("3"))))));
        when(orders.lockReceiptIdempotencyKey(5L, "receive-1")).thenReturn(1);
        Order order = order("SENT");
        OrderProduct line = line(new BigDecimal("0"));
        when(orders.lockPurchaseOrderForVendor(12L, 5L)).thenReturn(order);
        when(orders.findReceiptByKey(5L, "receive-1")).thenReturn(null, savedReceipt(44L, 12L,
                OrderService.receiptRequestHash(12L, request)));
        when(orders.insertReceipt(any())).thenAnswer(invocation -> {
            ((PurchaseReceipt) invocation.getArgument(0)).setId(44L);
            return 1;
        });
        when(orders.lockOrderProduct(71L, 12L)).thenReturn(line);
        when(products.findByIdAndVendor(81L, 5L)).thenReturn(new Product());
        when(orders.insertReceiptLine(any())).thenAnswer(invocation -> {
            ((PurchaseReceiptLine) invocation.getArgument(0)).setId(55L);
            return 1;
        });
        when(orders.insertReceiptBatch(eq(55L), anyString(), eq(expiry), any(), any())).thenReturn(1);
        when(products.adjustInventory(81L, 3L, new BigDecimal("24"))).thenReturn(1);
        when(orders.insertInventoryMovement(any())).thenReturn(1);
        when(orders.updateReceivedQuantity(71L, 12L, new BigDecimal("4"))).thenReturn(1);
        when(orders.findProductsByOrderId(12L)).thenReturn(List.of(line(new BigDecimal("4"))));
        when(orders.updateReceiptStatus(12L, 5L, "PARTIALLY_RECEIVED", 9L)).thenReturn(1);
        when(orders.updateReceiptEventStatus(44L, 5L, "PARTIALLY_RECEIVED")).thenReturn(1);

        PurchaseReceiptResult result = service.receivePurchaseOrder(12L, "receive-1", request);

        assertEquals("PARTIALLY_RECEIVED", result.status());
        assertEquals(44L, result.receiptId());
        verify(orders).insertReceiptBatch(55L, "A", expiry, new BigDecimal("6"), PurchaseReceiptRequest.DateType.USE_BY);
        verify(orders).insertReceiptBatch(55L, "B", expiry, new BigDecimal("18"), null);
        verify(products).adjustInventory(81L, 3L, new BigDecimal("24"));
        verify(orders).insertInventoryMovement(argThat(movement -> movement.getQuantityDelta().equals(new BigDecimal("24"))
                && movement.getSourceId().equals(44L) && movement.getSourceLineId().equals(55L)));
    }

    @Test
    void receiptFingerprintIncludesBatchDetailsAndIgnoresTheirOrder() {
        var expiry = java.time.LocalDate.parse("2026-11-30");
        var a = new PurchaseReceiptRequest.Batch("A", expiry, new BigDecimal("1"));
        var b = new PurchaseReceiptRequest.Batch("B", expiry, new BigDecimal("3"));
        var forward = new PurchaseReceiptRequest(List.of(new PurchaseReceiptRequest.Line(71L, new BigDecimal("4"), List.of(a, b))));
        var reverse = new PurchaseReceiptRequest(List.of(new PurchaseReceiptRequest.Line(71L, new BigDecimal("4"), List.of(b, a))));
        assertEquals(OrderService.receiptRequestHash(12L, forward), OrderService.receiptRequestHash(12L, reverse));
        var typed = new PurchaseReceiptRequest.Batch("A", expiry, BigDecimal.ONE, PurchaseReceiptRequest.DateType.BEST_BEFORE);
        var typedRequest = new PurchaseReceiptRequest(List.of(new PurchaseReceiptRequest.Line(71L, new BigDecimal("4"), List.of(typed, b))));
        org.junit.jupiter.api.Assertions.assertNotEquals(OrderService.receiptRequestHash(12L, forward), OrderService.receiptRequestHash(12L, typedRequest));
        org.junit.jupiter.api.Assertions.assertNotEquals(OrderService.receiptRequestHash(12L, request), OrderService.receiptRequestHash(12L, forward));
    }

    @Test
    void rejectsOverReceiptBeforeChangingStock() {
        when(orders.lockReceiptIdempotencyKey(5L, "receive-1")).thenReturn(1);
        when(orders.lockPurchaseOrderForVendor(12L, 5L)).thenReturn(order("SENT"));
        when(orders.findReceiptByKey(5L, "receive-1")).thenReturn(null);
        when(orders.insertReceipt(any())).thenAnswer(invocation -> {
            ((PurchaseReceipt) invocation.getArgument(0)).setId(44L);
            return 1;
        });
        when(orders.lockOrderProduct(71L, 12L)).thenReturn(line(new BigDecimal("8")));
        when(products.findByIdAndVendor(81L, 5L)).thenReturn(new Product());

        assertThrows(BusinessException.class, () -> service.receivePurchaseOrder(12L, "receive-1", request));
        verify(products, never()).adjustInventory(any(), any(), any());
        verify(orders, never()).insertInventoryMovement(any());
    }

    @Test
    void idempotentReplayDoesNotChangeInventoryAgain() {
        when(orders.lockReceiptIdempotencyKey(5L, "receive-1")).thenReturn(1);
        String hash = OrderService.receiptRequestHash(12L, request);
        when(orders.lockPurchaseOrderForVendor(12L, 5L)).thenReturn(order("RECEIVED"));
        when(orders.findReceiptByKey(5L, "receive-1")).thenReturn(savedReceipt(44L, 12L, hash));

        PurchaseReceiptResult result = service.receivePurchaseOrder(12L, "receive-1", request);

        assertEquals(true, result.replayed());
        verify(orders, never()).insertReceipt(any());
        verifyNoInteractions(products);
    }

    @Test
    void tenantCannotReceiveAnotherTenantsOrder() {
        when(orders.lockReceiptIdempotencyKey(5L, "receive-1")).thenReturn(1);
        when(orders.lockPurchaseOrderForVendor(12L, 5L)).thenReturn(null);

        assertThrows(BusinessException.class, () -> service.receivePurchaseOrder(12L, "receive-1", request));
        verify(orders, never()).findReceiptByKey(any(), any());
        verifyNoInteractions(products);
    }

    private static Order order(String status) {
        Order order = new Order();
        order.setId(12L);
        order.setType("ORDER");
        order.setStatus(status);
        order.setOutletId(3L);
        return order;
    }

    private static OrderProduct line(BigDecimal received) {
        OrderProduct line = new OrderProduct();
        line.setId(71L);
        line.setOrderId(12L);
        line.setProductId(81L);
        line.setOutletId(3L);
        line.setOrderedQuantity(new BigDecimal("10"));
        line.setReceivedQuantity(received);
        line.setCaseQuantity(new BigDecimal("6"));
        line.setOrderedCost(new BigDecimal("12.50"));
        return line;
    }

    private static PurchaseReceipt savedReceipt(Long id, Long orderId, String hash) {
        PurchaseReceipt receipt = new PurchaseReceipt();
        receipt.setId(id);
        receipt.setOrderId(orderId);
        receipt.setRequestHash(hash);
        receipt.setStatus("PARTIALLY_RECEIVED");
        receipt.setReceivedAt(LocalDateTime.parse("2026-11-08T10:00:00"));
        return receipt;
    }
}
