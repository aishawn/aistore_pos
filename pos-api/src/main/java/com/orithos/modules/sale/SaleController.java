package com.orithos.modules.sale;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import com.orithos.config.NativePosGate;
import com.orithos.modules.sale.dto.CheckoutRequest;
import com.orithos.modules.sale.dto.CheckoutResponse;
import com.orithos.modules.sale.dto.CheckoutQuoteResponse;
import com.orithos.modules.sale.dto.RefundRequest;
import com.orithos.modules.sale.dto.RefundResponse;
import com.orithos.security.PermissionAccess;
import com.orithos.security.CurrentUser;
import com.orithos.common.BusinessException;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/sales")
public class SaleController {

    private final SaleMapper mapper;
    private final CheckoutService checkoutService;
    private final NativePosGate nativePosGate;
    private final RefundService refundService;
    private final PermissionAccess permissionAccess;

    public SaleController(SaleMapper mapper, CheckoutService checkoutService, NativePosGate nativePosGate,
                          RefundService refundService, PermissionAccess permissionAccess) {
        this.mapper = mapper;
        this.checkoutService = checkoutService;
        this.nativePosGate = nativePosGate;
        this.refundService = refundService;
        this.permissionAccess = permissionAccess;
    }

    /** Finalise a Sell-pad cart with a tender (EFTPOS / cash), returning change. */
    @PostMapping("/quote")
    public ApiResult<CheckoutQuoteResponse> quote(@RequestBody CheckoutRequest req) {
        nativePosGate.requireEnabled();
        return ApiResult.ok(checkoutService.quote(req));
    }

    @PostMapping("/checkout")
    public ApiResult<CheckoutResponse> checkout(@RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
                                                @RequestBody CheckoutRequest req) {
        nativePosGate.requireEnabled();
        return ApiResult.ok(checkoutService.checkout(req, idempotencyKey));
    }

    @PostMapping("/{id}/refunds")
    public ApiResult<RefundResponse> refund(@PathVariable Long id,
                                            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
                                            @RequestBody RefundRequest request) {
        nativePosGate.requireEnabled();
        permissionAccess.requirePermission("sell.refund");
        return ApiResult.ok(refundService.refund(id, idempotencyKey, request));
    }

    @GetMapping
    public ApiResult<PageResult<Sale>> list(@RequestParam(required = false) String status,
                                            @RequestParam(required = false) Long customerId,
                                            @RequestParam(defaultValue = "1") int page,
                                            @RequestParam(defaultValue = "20") int size) {
        int offset = Math.max(0, (page - 1) * size);
        Long vendorId = requireVendor();
        var items = mapper.page(vendorId, CurrentUser.outletId(), status, customerId, size, offset);
        return ApiResult.ok(PageResult.of(items, mapper.count(vendorId, CurrentUser.outletId(), status, customerId), page, size));
    }

    @GetMapping("/{id}")
    public ApiResult<Sale> get(@PathVariable Long id) {
        Sale sale = mapper.findById(id, requireVendor(), CurrentUser.outletId());
        if (sale != null) {
            sale.setItems(mapper.findItemsBySaleId(id));
        }
        return ApiResult.ok(sale);
    }

    @PostMapping
    public ApiResult<Sale> create(@RequestBody Sale sale) {
        throw retiredSaleMutation();
    }

    @PutMapping("/{id}")
    public ApiResult<Sale> update(@PathVariable Long id, @RequestBody Sale sale) {
        throw retiredSaleMutation();
    }

    @PutMapping("/{id}/void")
    public ApiResult<Void> voidSale(@PathVariable Long id) {
        throw retiredSaleMutation();
    }

    @PutMapping("/{id}/unpark")
    public ApiResult<Void> unpark(@PathVariable Long id) {
        throw retiredSaleMutation();
    }

    private static ResponseStatusException retiredSaleMutation() {
        return new ResponseStatusException(HttpStatus.GONE,
                "Direct sale mutations are retired. Use the tendered checkout or refund workflow.");
    }

    private Long requireVendor() {
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) throw new BusinessException(40100, "Authentication required.");
        return vendorId;
    }

}
