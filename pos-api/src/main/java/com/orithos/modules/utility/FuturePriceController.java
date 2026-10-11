package com.orithos.modules.utility;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/future-prices")
public class FuturePriceController {

    private final FuturePriceMapper mapper;

    public FuturePriceController(FuturePriceMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<PageResult<FuturePrice>> list(@RequestParam(required = false) Long productId,
                                                   @RequestParam(defaultValue = "1") int page,
                                                   @RequestParam(defaultValue = "20") int size) {
        int offset = Math.max(0, (page - 1) * size);
        var items = mapper.page(productId, size, offset);
        return ApiResult.ok(PageResult.of(items, mapper.count(productId), page, size));
    }

    @PostMapping
    public ApiResult<FuturePrice> create(@RequestBody FuturePrice p) {
        mapper.insert(p);
        return ApiResult.ok(p);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.delete(id);
        return ApiResult.ok();
    }

    @PutMapping("/{id}/apply")
    public ApiResult<Void> apply(@PathVariable Long id) {
        return ApiResult.ok();
    }
}
