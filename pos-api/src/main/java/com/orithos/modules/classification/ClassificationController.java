package com.orithos.modules.classification;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.modules.classification.mapper.ClassificationMapper;
import com.orithos.modules.product.mapper.ProductMapper;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Brand / Category / Family / Tag CRUD.
 *   GET    /api/classifications/{type}
 *   POST   /api/classifications/{type}
 *   PUT    /api/classifications/{type}/{id}
 *   DELETE /api/classifications/{type}/{id}
 *   PUT    /api/classifications/{type}/{id}/products
 * where {type} = brand | category | family | tag.
 */
@RestController
@RequestMapping("/api/classifications")
public class ClassificationController {

    private final ClassificationMapper mapper;
    private final ProductMapper productMapper;

    public ClassificationController(ClassificationMapper mapper, ProductMapper productMapper) {
        this.mapper = mapper;
        this.productMapper = productMapper;
    }

    @GetMapping("/{type}")
    public ApiResult<List<Classification>> list(@PathVariable String type,
                                                @RequestParam(required = false) String name) {
        return ApiResult.ok(mapper.list(ClassificationType.from(type), name));
    }

    @GetMapping("/{type}/mdb-references")
    public ApiResult<List<MdbReference>> mdbReferences(@PathVariable String type) {
        return ApiResult.ok(mapper.listMdbReferences(ClassificationType.from(type).table()));
    }

    @GetMapping("/{type}/{id}")
    public ApiResult<Classification> get(@PathVariable String type, @PathVariable Long id) {
        return ApiResult.ok(mapper.findById(ClassificationType.from(type).table(), id));
    }

    @PostMapping("/{type}")
    public ApiResult<Classification> create(@PathVariable String type, @RequestBody Classification c) {
        mapper.insert(ClassificationType.from(type).table(), c);
        return ApiResult.ok(c);
    }

    @PutMapping("/{type}/{id}")
    public ApiResult<Classification> update(@PathVariable String type, @PathVariable Long id,
                                            @RequestBody Classification c) {
        c.setId(id);
        mapper.update(ClassificationType.from(type).table(), c);
        return ApiResult.ok(c);
    }

    @DeleteMapping("/{type}/{id}")
    public ApiResult<Void> delete(@PathVariable String type, @PathVariable Long id) {
        ClassificationType ct = ClassificationType.from(type);
        if (mapper.countProducts(ct, id) > 0) {
            throw new BusinessException(
                    "This classification is linked to products and cannot be deleted. "
                            + "Remove the product associations first.");
        }
        mapper.softDelete(ct.table(), id);
        return ApiResult.ok();
    }

    /** Replace the full set of products assigned to this classification. */
    @PutMapping("/{type}/{id}/products")
    @Transactional
    public ApiResult<Void> setProducts(@PathVariable String type, @PathVariable Long id,
                                       @RequestBody AssignProductsRequest body) {
        ClassificationType ct = ClassificationType.from(type);
        List<Long> ids = body != null && body.productIds() != null ? body.productIds() : List.of();
        switch (ct) {
            case BRAND -> {
                productMapper.clearBrandAssignment(id);
                if (!ids.isEmpty()) productMapper.assignBrandProducts(id, ids);
            }
            case CATEGORY -> {
                productMapper.clearCategoryAssignment(id);
                if (!ids.isEmpty()) productMapper.assignCategoryProducts(id, ids);
            }
            case FAMILY -> {
                productMapper.clearFamilyAssignment(id);
                if (!ids.isEmpty()) productMapper.assignFamilyProducts(id, ids);
            }
            case TAG -> {
                productMapper.clearTagAssignment(id);
                if (!ids.isEmpty()) productMapper.assignTagProducts(id, ids);
            }
        }
        return ApiResult.ok();
    }

    public record AssignProductsRequest(List<Long> productIds) {}
}
