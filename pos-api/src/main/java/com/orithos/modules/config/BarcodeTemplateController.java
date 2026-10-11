package com.orithos.modules.config;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/barcode-templates")
public class BarcodeTemplateController {

    private final BarcodeTemplateMapper mapper;

    public BarcodeTemplateController(BarcodeTemplateMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<List<BarcodeTemplate>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @PostMapping
    public ApiResult<BarcodeTemplate> create(@RequestBody BarcodeTemplate b) {
        if (b.getRecalculateQuantity() == null) b.setRecalculateQuantity(false);
        mapper.insert(b);
        return ApiResult.ok(b);
    }

    @PutMapping("/{id}")
    public ApiResult<BarcodeTemplate> update(@PathVariable Long id, @RequestBody BarcodeTemplate b) {
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
