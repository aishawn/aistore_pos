package com.orithos.modules.config;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/receipts")
public class ReceiptController {

    private final ReceiptMapper mapper;

    public ReceiptController(ReceiptMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<List<Receipt>> list(@RequestParam(required = false) String type) {
        return ApiResult.ok(mapper.findAll(type));
    }

    @GetMapping("/{id}")
    public ApiResult<Receipt> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<Receipt> create(@RequestBody Receipt r) {
        if (r.getAccountReceipt() == null) r.setAccountReceipt(false);
        mapper.insert(r);
        return ApiResult.ok(r);
    }

    @PutMapping("/{id}")
    public ApiResult<Receipt> update(@PathVariable Long id, @RequestBody Receipt r) {
        r.setId(id);
        mapper.update(r);
        return ApiResult.ok(r);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.delete(id);
        return ApiResult.ok();
    }

    @PostMapping("/{id}/clone")
    public ApiResult<Receipt> clone(@PathVariable Long id) {
        Receipt r = mapper.findById(id);
        if (r == null) return ApiResult.ok(null);
        r.setName(r.getName() + " (copy)");
        mapper.insert(r);
        return ApiResult.ok(r);
    }
}
