package com.orithos.modules.buyingperiod;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/buying-periods")
public class BuyingPeriodController {

    private final BuyingPeriodMapper mapper;

    public BuyingPeriodController(BuyingPeriodMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<PageResult<BuyingPeriod>> list(@RequestParam(defaultValue = "1") int page,
                                                    @RequestParam(defaultValue = "10") int size) {
        int offset = Math.max(0, (page - 1) * size);
        var items = mapper.page(size, offset);
        return ApiResult.ok(PageResult.of(items, mapper.count(), page, size));
    }

    @GetMapping("/{id}")
    public ApiResult<BuyingPeriod> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<BuyingPeriod> create(@RequestBody BuyingPeriod b) {
        mapper.insert(b);
        return ApiResult.ok(b);
    }

    @PutMapping("/{id}")
    public ApiResult<BuyingPeriod> update(@PathVariable Long id, @RequestBody BuyingPeriod b) {
        b.setId(id);
        mapper.update(b);
        return ApiResult.ok(b);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.delete(id);
        return ApiResult.ok();
    }
}
