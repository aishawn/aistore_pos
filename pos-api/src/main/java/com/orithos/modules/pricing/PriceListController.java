package com.orithos.modules.pricing;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import com.orithos.common.SqlLikeUtils;
import com.orithos.common.BusinessException;
import com.orithos.security.CurrentUser;
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
        Long outletId = requireOutlet();
        var items = mapper.page(search, outletId, size, offset);
        return ApiResult.ok(PageResult.of(items, mapper.count(search, outletId), page, size));
    }

    @GetMapping("/{id}")
    public ApiResult<PriceList> get(@PathVariable Long id) {
        Long outletId = requireOutlet();
        PriceList p = mapper.findById(id, outletId);
        if (p != null) {
            p.setItems(mapper.findItems(id, outletId));
        }
        return ApiResult.ok(p);
    }

    @PostMapping
    public ApiResult<PriceList> create(@RequestBody PriceList p) {
        p.setOutletId(requireOutlet());
        if (p.getAllowHigherPrice() == null) p.setAllowHigherPrice(false);
        if (p.getAllowDiscountingPromotions() == null) p.setAllowDiscountingPromotions(false);
        mapper.insert(p);
        replaceItems(p);
        return ApiResult.ok(p);
    }

    @PutMapping("/{id}")
    public ApiResult<PriceList> update(@PathVariable Long id, @RequestBody PriceList p) {
        Long outletId = requireOutlet();
        if (mapper.findById(id, outletId) == null) throw new BusinessException(40410, "Price list not found.");
        p.setId(id);
        p.setOutletId(outletId);
        mapper.update(p);
        replaceItems(p);
        return ApiResult.ok(p);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        Long outletId = requireOutlet();
        if (mapper.findById(id, outletId) == null) throw new BusinessException(40410, "Price list not found.");
        mapper.archive(id, outletId);
        return ApiResult.ok();
    }

    private void replaceItems(PriceList p) {
        mapper.deleteItems(p.getId(), p.getOutletId());
        if (p.getItems() != null) {
            for (PriceListItem item : p.getItems()) {
                item.setPriceListId(p.getId());
                item.setOutletId(p.getOutletId());
                if (item.getExclude() == null) item.setExclude(false);
                mapper.insertItem(item);
            }
        }
    }

    private static Long requireOutlet() {
        Long outletId = CurrentUser.outletId();
        if (outletId == null) throw new BusinessException(40100, "Authenticated outlet is required.");
        return outletId;
    }
}
