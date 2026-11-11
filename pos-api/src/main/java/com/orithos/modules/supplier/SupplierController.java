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
        return ApiResult.ok(service.list(name, page, size));
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
        service.delete(id);
        return ApiResult.ok();
    }

    /** Replace the full set of products linked to this supplier. */
    @PutMapping("/{id}/products")
    @Transactional
    public ApiResult<Void> setProducts(@PathVariable Long id, @RequestBody AssignProductsRequest body) {
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) throw new BusinessException(40310, "Tenant context is required.");
        if (mapper.findByIdAndVendor(id, vendorId) == null) {
            throw new BusinessException(40410, "Supplier not found.");
        }
        List<Long> ids = body != null && body.productIds() != null
                ? body.productIds().stream().distinct().toList() : List.of();
        if (ids.contains(null)) throw new BusinessException("Product ids cannot contain null values.");
        for (Long productId : ids) {
            if (productMapper.findByIdAndVendor(productId, vendorId) == null) {
                throw new BusinessException(40410, "Product not found.");
            }
        }
        productMapper.clearSupplierAssignment(id, vendorId);
        if (!ids.isEmpty()) {
            productMapper.assignSupplierProducts(id, ids, vendorId);
        }
        return ApiResult.ok();
    }

    /** Merge the given source suppliers INTO {id}: reassign all references, then soft-delete sources. */
    @PutMapping("/{id}/merge")
    @Transactional
    public ApiResult<Void> merge(@PathVariable Long id, @RequestBody MergeRequest body) {
        service.merge(id, body == null ? null : body.sourceIds());
        return ApiResult.ok();
    }

    public record MergeRequest(List<Long> sourceIds) {}

    public record AssignProductsRequest(List<Long> productIds) {}
}
