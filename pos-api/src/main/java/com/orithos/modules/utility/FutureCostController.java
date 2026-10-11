package com.orithos.modules.utility;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/future-costs")
public class FutureCostController {

    private final FutureCostMapper mapper;

    public FutureCostController(FutureCostMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<PageResult<FutureCost>> list(@RequestParam(required = false) Long productId,
                                                  @RequestParam(defaultValue = "1") int page,
                                                  @RequestParam(defaultValue = "20") int size) {
        int offset = Math.max(0, (page - 1) * size);
        var items = mapper.page(productId, size, offset);
        return ApiResult.ok(PageResult.of(items, mapper.count(productId), page, size));
    }

    @PostMapping
    public ApiResult<FutureCost> create(@RequestBody FutureCost c) {
        mapper.insert(c);
        return ApiResult.ok(c);
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
