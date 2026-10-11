package com.orithos.modules.bulkprice;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/bulk-price-edit")
public class BulkPriceEditController {

    private final BulkPriceEditService service;

    public BulkPriceEditController(BulkPriceEditService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResult<PageResult<BulkPriceEditRow>> list(BulkPriceEditQuery q) {
        return ApiResult.ok(service.page(q));
    }

    @PatchMapping("/prices")
    public ApiResult<Void> updatePrice(@RequestBody BulkPriceEditService.PriceUpdate body) {
        service.upsertPrice(body.productId(), body.quantity(), body.price(), body.priceId());
        return ApiResult.ok();
    }
}
