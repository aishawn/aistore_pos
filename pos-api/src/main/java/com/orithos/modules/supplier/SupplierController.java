package com.orithos.modules.supplier;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.security.CurrentUser;
import com.orithos.common.BusinessException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/suppliers")
public class SupplierController {

    private final SupplierMapper mapper;
    private final SupplierService service;
    private final SupplierProductImportService importService;
    private final ProductMapper productMapper;

    public SupplierController(SupplierMapper mapper,
                              SupplierService service,
                              SupplierProductImportService importService,
                              ProductMapper productMapper) {
        this.mapper = mapper;
        this.service = service;
        this.importService = importService;
        this.productMapper = productMapper;
    }

    @GetMapping
    public ApiResult<PageResult<Supplier>> list(@RequestParam(required = false) String name,
                                                @RequestParam(defaultValue = "1") int page,
                                                @RequestParam(defaultValue = "10") int size) {
        int offset = Math.max(0, (page - 1) * size);
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) throw new BusinessException(40310, "Tenant context is required.");
        var items = mapper.page(name, vendorId, size, offset);
        return ApiResult.ok(PageResult.of(items, mapper.count(name, vendorId), page, size));
    }

    @GetMapping("/{id}")
    public ApiResult<SupplierDetail> get(@PathVariable Long id) {
        return ApiResult.ok(service.getDetail(id));
    }

    @PostMapping
    public ApiResult<SupplierDetail> create(@RequestBody SupplierDetail body) {
        return ApiResult.ok(service.create(body));
    }

    @PostMapping("/import-products")
    public ApiResult<SupplierProductImportResult> importProducts(
            @RequestBody SupplierProductImportService.ImportRequest body) {
        return ApiResult.ok(importService.importProducts(body.supplierId(), body.productList()));
    }

    @PutMapping("/{id}")
    public ApiResult<SupplierDetail> update(@PathVariable Long id, @RequestBody SupplierDetail body) {
        return ApiResult.ok(service.update(id, body));
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.softDelete(id);
        return ApiResult.ok();
    }

    /** Replace the full set of products linked to this supplier. */
    @PutMapping("/{id}/products")
    @Transactional
    public ApiResult<Void> setProducts(@PathVariable Long id, @RequestBody AssignProductsRequest body) {
        if (mapper.findById(id) == null) {
            return ApiResult.ok();
        }
        productMapper.clearSupplierAssignment(id);
        List<Long> ids = body != null && body.productIds() != null ? body.productIds() : List.of();
        if (!ids.isEmpty()) {
            productMapper.assignSupplierProducts(id, ids);
        }
        return ApiResult.ok();
    }

    /** Merge the given source suppliers INTO {id}: reassign all references, then soft-delete sources. */
    @PutMapping("/{id}/merge")
    @Transactional
    public ApiResult<Void> merge(@PathVariable Long id, @RequestBody MergeRequest body) {
        if (body != null && body.sourceIds() != null) {
            for (Long src : body.sourceIds()) {
                if (src == null || src.equals(id)) continue;
                mapper.reassignProductCoreSupplier(id, src);
                mapper.reassignProductSupplier(id, src);
                mapper.reassignOrderFrom(id, src);
                mapper.reassignOrderProductSupplier(id, src);
                mapper.reassignFutureCostSupplier(id, src);
                mapper.softDelete(src);
            }
        }
        return ApiResult.ok();
    }

    public record MergeRequest(List<Long> sourceIds) {}

    public record AssignProductsRequest(List<Long> productIds) {}
}
