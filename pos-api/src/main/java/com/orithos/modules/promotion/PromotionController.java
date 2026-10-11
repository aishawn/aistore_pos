package com.orithos.modules.promotion;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/promotions")
public class PromotionController {

    private final PromotionMapper mapper;

    public PromotionController(PromotionMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<PageResult<Promotion>> list(@RequestParam(required = false) String name,
                                                 @RequestParam(required = false) Long promotionCategoryId,
                                                 @RequestParam(required = false) Boolean active,
                                                 @RequestParam(defaultValue = "1") int page,
                                                 @RequestParam(defaultValue = "20") int size) {
        int offset = Math.max(0, (page - 1) * size);
        var items = mapper.page(name, promotionCategoryId, active, size, offset);
        return ApiResult.ok(PageResult.of(items, mapper.count(name, promotionCategoryId, active), page, size));
    }

    @GetMapping("/{id}")
    public ApiResult<Promotion> get(@PathVariable Long id) {
        Promotion p = mapper.findById(id);
        if (p != null) {
            p.setCriteria(mapper.findCriteriaByPromotionId(id));
        }
        return ApiResult.ok(p);
    }

    @PostMapping
    public ApiResult<Promotion> create(@RequestBody Promotion p) {
        if (p.getActive() == null) p.setActive(true);
        if (p.getExpress() == null) p.setExpress(false);
        if (p.getMixCriteria() == null) p.setMixCriteria(false);
        mapper.insert(p);
        return ApiResult.ok(p);
    }

    @PutMapping("/{id}")
    public ApiResult<Promotion> update(@PathVariable Long id, @RequestBody Promotion p) {
        p.setId(id);
        mapper.update(p);
        return ApiResult.ok(p);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.softDelete(id);
        return ApiResult.ok();
    }

    @PutMapping("/{id}/activate")
    public ApiResult<Void> activate(@PathVariable Long id) {
        mapper.setActive(id, true);
        return ApiResult.ok();
    }

    @PutMapping("/{id}/deactivate")
    public ApiResult<Void> deactivate(@PathVariable Long id) {
        mapper.setActive(id, false);
        return ApiResult.ok();
    }

    @PostMapping("/{id}/clone")
    @Transactional
    public ApiResult<Promotion> clone(@PathVariable Long id) {
        Promotion source = mapper.findById(id);
        if (source == null) return ApiResult.ok(null);
        List<PromotionCriteria> criteria = mapper.findCriteriaByPromotionId(id);
        source.setName(source.getName() + " (copy)");
        source.setActive(false);
        mapper.insert(source);
        for (PromotionCriteria c : criteria) {
            c.setId(null);
            c.setPromotionId(source.getId());
            mapper.insertCriteria(c);
        }
        source.setCriteria(criteria);
        return ApiResult.ok(source);
    }
}
