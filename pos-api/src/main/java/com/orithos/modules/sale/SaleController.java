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

import java.math.BigDecimal;

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
        sale.setOutletId(requireOutlet());
        if (sale.getStatus() == null) sale.setStatus("ACTIVE");
        if (sale.getTotalQuantity() == null) sale.setTotalQuantity(0);
        if (sale.getTotalPrice() == null) sale.setTotalPrice(BigDecimal.ZERO);
        if (sale.getOutstanding() == null) sale.setOutstanding(BigDecimal.ZERO);
        mapper.insert(sale);
        if (sale.getItems() != null) {
            for (SaleItem item : sale.getItems()) {
                item.setSaleId(sale.getId());
                mapper.insertItem(item);
            }
        }
        return ApiResult.ok(sale);
    }

    @PutMapping("/{id}")
    public ApiResult<Sale> update(@PathVariable Long id, @RequestBody Sale sale) {
        sale.setId(id);
        if (mapper.update(sale, requireVendor(), CurrentUser.outletId()) == 0) throw new BusinessException("Sale not found.");
        return ApiResult.ok(sale);
    }

    @PutMapping("/{id}/void")
    public ApiResult<Void> voidSale(@PathVariable Long id) {
        if (mapper.markVoid(id, requireVendor(), CurrentUser.outletId()) == 0) throw new BusinessException("Sale not found.");
        return ApiResult.ok();
    }

    @PutMapping("/{id}/unpark")
    public ApiResult<Void> unpark(@PathVariable Long id) {
        if (mapper.unpark(id, requireVendor(), CurrentUser.outletId()) == 0) throw new BusinessException("Sale not found.");
        return ApiResult.ok();
    }

    private Long requireVendor() {
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) throw new BusinessException(40100, "Authentication required.");
        return vendorId;
    }

    private Long requireOutlet() {
        Long outletId = CurrentUser.outletId();
        if (outletId == null) throw new BusinessException(40000, "An outlet must be selected.");
        return outletId;
    }
}
