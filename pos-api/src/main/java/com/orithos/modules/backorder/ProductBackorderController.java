package com.orithos.modules.backorder;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/product-backorders")
public class ProductBackorderController {

    private final ProductBackorderMapper mapper;

    public ProductBackorderController(ProductBackorderMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<List<ProductBackorder>> list(@RequestParam(required = false) Long productId) {
        return ApiResult.ok(mapper.findAll(productId));
    }

    @GetMapping("/{id}")
    public ApiResult<ProductBackorder> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<ProductBackorder> create(@RequestBody ProductBackorder b) {
        mapper.insert(b);
        return ApiResult.ok(b);
    }

    @PutMapping("/{id}")
    public ApiResult<ProductBackorder> update(@PathVariable Long id, @RequestBody ProductBackorder b) {
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
