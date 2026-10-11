package com.orithos.modules.stocktake;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.common.PageResult;
import com.orithos.modules.register.Outlet;
import com.orithos.modules.register.OutletMapper;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/stocktakes")
public class StocktakeController {

    private final StocktakeMapper mapper;
    private final OutletMapper outletMapper;
    private final StocktakeService stocktakeService;

    public StocktakeController(StocktakeMapper mapper, OutletMapper outletMapper, StocktakeService stocktakeService) {
        this.mapper = mapper;
        this.outletMapper = outletMapper;
        this.stocktakeService = stocktakeService;
    }

    @GetMapping
    public ApiResult<PageResult<Stocktake>> list(@RequestParam(required = false) String status,
                                                 @RequestParam(required = false) Long outletId,
                                                 @RequestParam(required = false) LocalDate createdFrom,
                                                 @RequestParam(required = false) LocalDate createdTo,
                                                 @RequestParam(required = false) LocalDate completedFrom,
                                                 @RequestParam(required = false) LocalDate completedTo,
                                                 @RequestParam(defaultValue = "1") int page,
                                                 @RequestParam(defaultValue = "10") int size) {
        LocalDateTime createdFromAt = createdFrom != null ? createdFrom.atStartOfDay() : null;
        LocalDateTime createdToAt = createdTo != null ? createdTo.plusDays(1).atStartOfDay() : null;
        LocalDateTime completedFromAt = completedFrom != null ? completedFrom.atStartOfDay() : null;
        LocalDateTime completedToAt = completedTo != null ? completedTo.plusDays(1).atStartOfDay() : null;

        int offset = Math.max(0, (page - 1) * size);
        var items = mapper.page(status, outletId, createdFromAt, createdToAt, completedFromAt, completedToAt, size, offset);
        return ApiResult.ok(PageResult.of(
                items,
                mapper.count(status, outletId, createdFromAt, createdToAt, completedFromAt, completedToAt),
                page,
                size));
    }

    @GetMapping("/{id}")
    public ApiResult<Stocktake> get(@PathVariable Long id) {
        Stocktake s = mapper.findById(id);
        if (s != null) {
            s.setProducts(mapper.findProducts(id));
        }
        return ApiResult.ok(s);
    }

    @PostMapping
    public ApiResult<Stocktake> create(@RequestBody CreateStocktakeRequest req) {
        if (req.getName() == null || req.getName().isBlank()) {
            throw new BusinessException("Name is required");
        }
        if (req.getOutletId() == null) {
            throw new BusinessException("Outlet is required");
        }

        Outlet outlet = outletMapper.findById(req.getOutletId());
        if (outlet == null || outlet.getDeletedAt() != null) {
            throw new BusinessException("Outlet not found");
        }

        Stocktake s = new Stocktake();
        s.setName(req.getName().trim());
        s.setOutletId(req.getOutletId());
        s.setType(req.getType() != null && !req.getType().isBlank() ? req.getType().trim() : "ADVANCED");
        s.setStatus("IN_PROGRESS");
        s.setDisplayExpected(req.getDisplayExpected() != null ? req.getDisplayExpected() : false);
        s.setApplied(false);
        mapper.insert(s);
        return ApiResult.ok(mapper.findById(s.getId()));
    }

    @PostMapping("/express")
    public ApiResult<ExpressStocktakeDetail> startExpress(@RequestBody ExpressStocktakeRequest req) {
        return ApiResult.ok(stocktakeService.startExpress(req.getOutletId()));
    }

    @GetMapping("/{id}/express")
    public ApiResult<ExpressStocktakeDetail> getExpress(@PathVariable Long id) {
        return ApiResult.ok(stocktakeService.getExpressDetail(id));
    }

    @GetMapping("/{id}/product-search")
    public ApiResult<List<StocktakeProductSearchHit>> searchProducts(@PathVariable Long id,
                                                                     @RequestParam String q) {
        return ApiResult.ok(stocktakeService.searchProducts(id, q));
    }

    @PostMapping("/{id}/scan")
    public ApiResult<ExpressStocktakeDetail> scan(@PathVariable Long id, @RequestBody ScanProductRequest req) {
        return ApiResult.ok(stocktakeService.scanProduct(id, req));
    }

    @PutMapping("/{id}")
    public ApiResult<Stocktake> update(@PathVariable Long id, @RequestBody Stocktake s) {
        s.setId(id);
        mapper.update(s);
        return ApiResult.ok(s);
    }

    @PutMapping("/{id}/complete")
    public ApiResult<Void> complete(@PathVariable Long id) {
        mapper.complete(id);
        return ApiResult.ok();
    }

    @PutMapping("/{id}/cancel")
    public ApiResult<Void> cancel(@PathVariable Long id) {
        mapper.cancel(id);
        return ApiResult.ok();
    }

    @PutMapping("/{id}/apply")
    public ApiResult<Void> apply(@PathVariable Long id) {
        mapper.apply(id);
        return ApiResult.ok();
    }

    @PostMapping("/{id}/products")
    public ApiResult<StocktakeProduct> upsertProduct(@PathVariable Long id, @RequestBody StocktakeProduct p) {
        p.setStocktakeId(id);
        if (p.getScanned() == null) p.setScanned(false);
        mapper.deleteProduct(id, p.getProductId());
        mapper.insertProduct(p);
        return ApiResult.ok(p);
    }

    public record CountRequest(Long productId, java.math.BigDecimal counted) {}

    @PutMapping("/{id}/count")
    public ApiResult<Void> count(@PathVariable Long id, @RequestBody CountRequest req) {
        mapper.updateCount(id, req.productId(), req.counted());
        return ApiResult.ok();
    }
}
