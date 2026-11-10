package com.orithos.modules.tax;

import com.orithos.common.ApiResult;
import com.orithos.security.CurrentUser;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/tax-rates")
public class TaxRateController {

    private final TaxRateMapper mapper;

    public TaxRateController(TaxRateMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<List<TaxRate>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @GetMapping("/{id}")
    public ApiResult<TaxRate> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<TaxRate> create(@RequestBody TaxRate t) {
        if (t.getName() != null && !t.getName().isBlank() && mapper.findByNameIgnoreCase(t.getName()) != null) {
            throw new IllegalArgumentException("tax_rate_name_exists");
        }
        if (t.getIsDefault() == null) t.setIsDefault(false);
        if (t.getOutletId() == null) {
            Long outletId = CurrentUser.outletId();
            t.setOutletId(outletId != null ? outletId : 1L);
        }
        mapper.insert(t);
        return ApiResult.ok(t);
    }

    @PutMapping("/{id}")
    public ApiResult<TaxRate> update(@PathVariable Long id, @RequestBody TaxRate t) {
        t.setId(id);
        mapper.update(t);
        return ApiResult.ok(t);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.softDelete(id);
        return ApiResult.ok();
    }

    @PutMapping("/{id}/set-default")
    @Transactional
    public ApiResult<Void> setDefault(@PathVariable Long id) {
        mapper.clearDefaults();
        mapper.markDefault(id);
        return ApiResult.ok();
    }

    /** Merge the given source rates INTO {id}: reassign all references, then soft-delete sources. */
    @PutMapping("/{id}/merge")
    @Transactional
    public ApiResult<Void> merge(@PathVariable Long id, @RequestBody MergeRequest body) {
        if (body != null && body.sourceIds() != null) {
            for (Long src : body.sourceIds()) {
                if (src == null || src.equals(id)) continue;
                mapper.reassignProductTaxRate(id, src);
                mapper.reassignProductCostTaxRate(id, src);
                mapper.reassignVendorDefaultTaxRate(id, src);
                mapper.reassignSaleItemTaxRate(id, src);
                mapper.softDelete(src);
            }
        }
        return ApiResult.ok();
    }

    public record MergeRequest(List<Long> sourceIds) {}
}
