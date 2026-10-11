package com.orithos.modules.sale;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import com.orithos.modules.sale.dto.CheckoutRequest;
import com.orithos.modules.sale.dto.CheckoutResponse;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;

@RestController
@RequestMapping("/api/sales")
public class SaleController {

    private final SaleMapper mapper;
    private final CheckoutService checkoutService;

    public SaleController(SaleMapper mapper, CheckoutService checkoutService) {
        this.mapper = mapper;
        this.checkoutService = checkoutService;
    }

    /** Finalise a Sell-pad cart with a tender (EFTPOS / cash), returning change. */
    @PostMapping("/checkout")
    public ApiResult<CheckoutResponse> checkout(@RequestBody CheckoutRequest req) {
        return ApiResult.ok(checkoutService.checkout(req));
    }

    @GetMapping
    public ApiResult<PageResult<Sale>> list(@RequestParam(required = false) String status,
                                            @RequestParam(required = false) Long customerId,
                                            @RequestParam(defaultValue = "1") int page,
                                            @RequestParam(defaultValue = "20") int size) {
        int offset = Math.max(0, (page - 1) * size);
        var items = mapper.page(status, customerId, size, offset);
        return ApiResult.ok(PageResult.of(items, mapper.count(status, customerId), page, size));
    }

    @GetMapping("/{id}")
    public ApiResult<Sale> get(@PathVariable Long id) {
        Sale sale = mapper.findById(id);
        if (sale != null) {
            sale.setItems(mapper.findItemsBySaleId(id));
        }
        return ApiResult.ok(sale);
    }

    @PostMapping
    public ApiResult<Sale> create(@RequestBody Sale sale) {
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
        mapper.update(sale);
        return ApiResult.ok(sale);
    }

    @PutMapping("/{id}/void")
    public ApiResult<Void> voidSale(@PathVariable Long id) {
        mapper.markVoid(id);
        return ApiResult.ok();
    }

    @PutMapping("/{id}/unpark")
    public ApiResult<Void> unpark(@PathVariable Long id) {
        mapper.unpark(id);
        return ApiResult.ok();
    }
}
