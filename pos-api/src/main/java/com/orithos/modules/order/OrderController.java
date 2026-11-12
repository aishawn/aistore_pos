package com.orithos.modules.order;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import com.orithos.config.NativePosGate;
import com.orithos.modules.ai.invoice.InvoiceScanResponse;
import com.orithos.modules.ai.invoice.InvoiceScanService;
import com.orithos.security.CurrentUser;
import com.orithos.common.BusinessException;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final OrderMapper mapper;
    private final OrderService orderService;
    private final InvoiceScanService invoiceScanService;
    private final NativePosGate nativePosGate;

    public OrderController(OrderMapper mapper, OrderService orderService, InvoiceScanService invoiceScanService,
                           NativePosGate nativePosGate) {
        this.mapper = mapper;
        this.orderService = orderService;
        this.invoiceScanService = invoiceScanService;
        this.nativePosGate = nativePosGate;
    }

    @GetMapping
    public ApiResult<PageResult<Order>> list(@RequestParam(required = false) String status,
                                             @RequestParam(required = false) String type,
                                             @RequestParam(required = false) Long supplierId,
                                             @RequestParam(required = false) Long transferorId,
                                             @RequestParam(required = false) Long outletId,
                                             @RequestParam(required = false) String invoiceNumber,
                                             @RequestParam(required = false) String reference,
                                             @RequestParam(required = false) LocalDate orderDate,
                                             @RequestParam(required = false) LocalDate orderDateFrom,
                                             @RequestParam(required = false) LocalDate orderDateTo,
                                             @RequestParam(required = false) LocalDate dueDate,
                                             @RequestParam(required = false) Long createdById,
                                             @RequestParam(required = false) Long sentById,
                                             @RequestParam(required = false) Long receivedById,
                                             @RequestParam(required = false) Long productId,
                                             @RequestParam(defaultValue = "1") int page,
                                             @RequestParam(defaultValue = "10") int size) {
        OrderListQuery query = new OrderListQuery();
        query.setStatus(status);
        query.setType(type);
        query.setSupplierId(supplierId);
        query.setTransferorId(transferorId);
        query.setOutletId(outletId);
        query.setInvoiceNumber(invoiceNumber);
        query.setReference(reference);
        query.setOrderDate(orderDate);
        query.setOrderDateFrom(orderDateFrom);
        query.setOrderDateTo(orderDateTo);
        query.setDueDate(dueDate);
        query.setCreatedById(createdById);
        query.setSentById(sentById);
        query.setReceivedById(receivedById);
        query.setProductId(productId);
        query.setVendorId(requireVendor());
        query.setPage(page);
        query.setSize(size);
        return ApiResult.ok(orderService.search(query));
    }

    @GetMapping("/{id}")
    public ApiResult<Order> get(@PathVariable Long id) {
        Order order = mapper.findByIdForVendor(id, requireVendor());
        if (order != null) {
            order.setProducts(mapper.findProductsByOrderId(id));
        }
        return ApiResult.ok(order);
    }

    @PostMapping
    public ApiResult<Order> create(@RequestBody CreateOrderRequest request) {
        nativePosGate.requireEnabled();
        return ApiResult.ok(orderService.create(request));
    }

    @PostMapping("/transfers")
    public ApiResult<Order> createTransfer(@RequestBody CreateTransferRequest request) {
        nativePosGate.requireEnabled();
        return ApiResult.ok(orderService.createTransfer(request));
    }

    @PostMapping("/receives")
    public ApiResult<Order> createReceive(@RequestHeader("Idempotency-Key") String idempotencyKey,
                                          @RequestBody CreateReceiveRequest request) {
        nativePosGate.requireEnabled();
        return ApiResult.ok(orderService.createReceive(request, idempotencyKey));
    }

    @PostMapping(value = "/receives/scan", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResult<InvoiceScanResponse> scanReceive(@RequestParam("file") MultipartFile file) {
        return ApiResult.ok(invoiceScanService.scan(file));
    }

    @PostMapping("/receives/from-scan")
    public ApiResult<Order> saveScannedReceive(@RequestBody InvoiceScanResponse request) {
        nativePosGate.requireEnabled();
        return ApiResult.ok(invoiceScanService.save(request));
    }

    @PostMapping("/returns")
    public ApiResult<Order> createReturn(@RequestBody CreateReturnRequest request) {
        nativePosGate.requireEnabled();
        return ApiResult.ok(orderService.createReturn(request));
    }

    @PostMapping("/credits")
    public ApiResult<Order> createCredit(@RequestBody CreateCreditRequest request) {
        nativePosGate.requireEnabled();
        return ApiResult.ok(orderService.createCredit(request));
    }

    @PutMapping("/{id}")
    public ApiResult<Order> update(@PathVariable Long id, @RequestBody Order order) {
        nativePosGate.requireEnabled();
        return ApiResult.ok(orderService.update(id, order));
    }

    @PutMapping("/{id}/send")
    public ApiResult<Void> send(@PathVariable Long id) {
        nativePosGate.requireEnabled();
        if (mapper.markSent(id, requireVendor()) == 0) throw new BusinessException(40410, "Order not found.");
        return ApiResult.ok();
    }

    @PutMapping("/{id}/receive")
    public ApiResult<Void> receive(@PathVariable Long id) {
        throw new BusinessException("Receive quantities must be recorded against purchase order lines.");
    }

    @PostMapping("/{id}/receipts")
    public ApiResult<PurchaseReceiptResult> receiveLines(@PathVariable Long id,
                                                          @RequestHeader("Idempotency-Key") String idempotencyKey,
                                                          @RequestBody PurchaseReceiptRequest request) {
        nativePosGate.requireEnabled();
        return ApiResult.ok(orderService.receivePurchaseOrder(id, idempotencyKey, request));
    }

    @PutMapping("/{id}/cancel")
    public ApiResult<Void> cancel(@PathVariable Long id) {
        nativePosGate.requireEnabled();
        if (mapper.markCancelled(id, requireVendor()) == 0) throw new BusinessException(40410, "Order not found.");
        return ApiResult.ok();
    }

    @PutMapping("/{id}/reopen")
    public ApiResult<Void> reopen(@PathVariable Long id) {
        nativePosGate.requireEnabled();
        if (mapper.reopen(id, requireVendor()) == 0) throw new BusinessException(40410, "Order not found.");
        return ApiResult.ok();
    }

    @PutMapping("/{id}/related")
    public ApiResult<Void> markOrdersAsRelated(@PathVariable Long id, @RequestBody List<Long> relatedOrderIds) {
        nativePosGate.requireEnabled();
        if (relatedOrderIds != null) {
            for (Long relatedOrderId : relatedOrderIds) {
                if (mapper.insertRelated(id, relatedOrderId, requireVendor()) == 0) throw new BusinessException(40410, "Order not found.");
            }
        }
        return ApiResult.ok();
    }

    private static Long requireVendor() {
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) throw new BusinessException(40310, "Tenant context is required.");
        return vendorId;
    }
}
