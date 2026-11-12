package com.orithos.modules.tax;

import com.orithos.common.ApiResult;
import com.orithos.security.CurrentUser;
import com.orithos.security.PermissionAccess;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashSet;
import java.util.List;

@RestController
@RequestMapping("/api/tax-rates")
public class TaxRateController {

    private final TaxRateMapper mapper;
    private final PermissionAccess permissions;

    public TaxRateController(TaxRateMapper mapper, PermissionAccess permissions) {
        this.mapper = mapper;
        this.permissions = permissions;
    }

    @GetMapping
    public ApiResult<List<TaxRate>> list() {
        return ApiResult.ok(mapper.findAll(requireOutlet()));
    }

    @GetMapping("/{id}")
    public ApiResult<TaxRate> get(@PathVariable Long id) {
        return ApiResult.ok(requireRate(id, requireOutlet()));
    }

    @PostMapping
    public ApiResult<TaxRate> create(@RequestBody TaxRate t) {
        permissions.requirePermission("settings.store");
        Long outletId = requireOutlet();
        if (t.getName() != null && !t.getName().isBlank()
                && mapper.findByNameIgnoreCase(t.getName(), outletId) != null) {
            throw new IllegalArgumentException("tax_rate_name_exists");
        }
        if (t.getIsDefault() == null) t.setIsDefault(false);
        t.setOutletId(outletId);
        mapper.insert(t);
        return ApiResult.ok(t);
    }

    @PutMapping("/{id}")
    public ApiResult<TaxRate> update(@PathVariable Long id, @RequestBody TaxRate t) {
        permissions.requirePermission("settings.store");
        Long outletId = requireOutlet();
        t.setId(id);
        t.setOutletId(outletId);
        if (mapper.update(t, outletId) != 1) throw notFound();
        return ApiResult.ok(t);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        permissions.requirePermission("settings.store");
        if (mapper.softDelete(id, requireOutlet()) != 1) throw notFound();
        return ApiResult.ok();
    }

    @PutMapping("/{id}/set-default")
    @Transactional
    public ApiResult<Void> setDefault(@PathVariable Long id) {
        permissions.requirePermission("settings.store");
        Long outletId = requireOutlet();
        requireRate(id, outletId);
        mapper.clearDefaults(outletId);
        if (mapper.markDefault(id, outletId) != 1) throw notFound();
        return ApiResult.ok();
    }

    /** Merge the given source rates INTO {id}: reassign all references, then soft-delete sources. */
    @PutMapping("/{id}/merge")
    @Transactional
    public ApiResult<Void> merge(@PathVariable Long id, @RequestBody MergeRequest body) {
        permissions.requirePermission("settings.store");
        Long outletId = requireOutlet();
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "A vendor is required");
        requireRate(id, outletId);
        List<Long> sources = body == null || body.sourceIds() == null ? List.of()
                : new LinkedHashSet<>(body.sourceIds()).stream()
                        .filter(src -> src != null && !src.equals(id)).toList();
        for (Long sourceId : sources) requireRate(sourceId, outletId);
        for (Long sourceId : sources) {
            mapper.reassignProductTaxRate(id, sourceId, outletId);
            mapper.reassignProductCostTaxRate(id, sourceId, outletId);
            mapper.reassignVendorDefaultTaxRate(id, sourceId, vendorId);
            mapper.reassignSaleItemTaxRate(id, sourceId, outletId);
            if (mapper.softDelete(sourceId, outletId) != 1) throw notFound();
        }
        return ApiResult.ok();
    }

    private Long requireOutlet() {
        Long outletId = CurrentUser.outletId();
        if (outletId == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "An outlet is required");
        return outletId;
    }

    private TaxRate requireRate(Long id, Long outletId) {
        TaxRate rate = mapper.findById(id, outletId);
        if (rate == null) throw notFound();
        return rate;
    }

    private ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Tax rate not found");
    }

    public record MergeRequest(List<Long> sourceIds) {}
}
