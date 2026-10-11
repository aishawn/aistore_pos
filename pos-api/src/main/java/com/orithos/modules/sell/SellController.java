package com.orithos.modules.sell;

import com.orithos.common.ApiResult;
import com.orithos.modules.sale.Sale;
import com.orithos.modules.sell.dto.*;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** REST endpoints backing the Sell-pad click flows on the POS home screen. */
@RestController
@RequestMapping("/api/sell")
public class SellController {

    private final SellService sellService;

    public SellController(SellService sellService) {
        this.sellService = sellService;
    }

    @GetMapping("/search")
    public ApiResult<SellSearchResponse> search(@RequestParam(required = false) String q) {
        return ApiResult.ok(sellService.search(q));
    }

    /** Products / Beer / Wines / Spirits folder on the Sell pad. */
    @GetMapping("/products/browse")
    public ApiResult<ProductBrowseResponse> browseProducts(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String q) {
        return ApiResult.ok(sellService.browseProducts(category, q));
    }

    @GetMapping("/quick-key/product/{id}")
    public ApiResult<SellSearchResponse.ProductHit> quickKeyProduct(@PathVariable Long id) {
        return ApiResult.ok(sellService.findQuickKeyProductById(id));
    }

    @GetMapping("/quick-key/{key}")
    public ApiResult<SellSearchResponse.ProductHit> quickKey(@PathVariable String key) {
        return ApiResult.ok(sellService.findQuickKeyProduct(key));
    }

    @GetMapping("/parked")
    public ApiResult<List<Sale>> listParked() {
        return ApiResult.ok(sellService.listParked());
    }

    @GetMapping("/parked/{id}")
    public ApiResult<Sale> getParked(@PathVariable Long id) {
        return ApiResult.ok(sellService.getParked(id));
    }

    @PostMapping("/park")
    public ApiResult<Sale> park(@RequestBody ParkSaleRequest req) {
        return ApiResult.ok(sellService.park(req));
    }

    @PostMapping("/parked/{id}/resume")
    public ApiResult<Sale> resume(@PathVariable Long id) {
        return ApiResult.ok(sellService.resume(id));
    }

    /** Discard a parked sale without restoring it to the cart. */
    @DeleteMapping("/parked/{id}")
    public ApiResult<Void> voidParked(@PathVariable Long id) {
        sellService.voidParked(id);
        return ApiResult.ok();
    }

    @PostMapping("/actions")
    public ApiResult<SellActionResponse> action(@RequestBody SellActionRequest req) {
        return ApiResult.ok(sellService.executeAction(req));
    }
}
