package com.orithos.modules.pricing;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import com.orithos.common.SqlLikeUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/price-lists")
public class PriceListController {

    private final PriceListMapper mapper;

    public PriceListController(PriceListMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<PageResult<PriceList>> list(@RequestParam(required = false) String name,
                                                 @RequestParam(defaultValue = "1") int page,
                                                 @RequestParam(defaultValue = "10") int size) {
        int offset = Math.max(0, (page - 1) * size);
        String search = SqlLikeUtils.prepareLikeSearch(name);
        var items = mapper.page(search, size, offset);
        return ApiResult.ok(PageResult.of(items, mapper.count(search), page, size));
    }

    @GetMapping("/{id}")
    public ApiResult<PriceList> get(@PathVariable Long id) {
        PriceList p = mapper.findById(id);
        if (p != null) {
            p.setItems(mapper.findItems(id));
        }
        return ApiResult.ok(p);
    }

    @PostMapping
    public ApiResult<PriceList> create(@RequestBody PriceList p) {
        if (p.getAllowHigherPrice() == null) p.setAllowHigherPrice(false);
        if (p.getAllowDiscountingPromotions() == null) p.setAllowDiscountingPromotions(false);
        mapper.insert(p);
        replaceItems(p);
        return ApiResult.ok(p);
    }

    @PutMapping("/{id}")
    public ApiResult<PriceList> update(@PathVariable Long id, @RequestBody PriceList p) {
        p.setId(id);
        mapper.update(p);
        replaceItems(p);
        return ApiResult.ok(p);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.deleteItems(id);
        mapper.delete(id);
        return ApiResult.ok();
    }

    private void replaceItems(PriceList p) {
        mapper.deleteItems(p.getId());
        if (p.getItems() != null) {
            for (PriceListItem item : p.getItems()) {
                item.setPriceListId(p.getId());
                if (item.getExclude() == null) item.setExclude(false);
                mapper.insertItem(item);
            }
        }
    }
}
