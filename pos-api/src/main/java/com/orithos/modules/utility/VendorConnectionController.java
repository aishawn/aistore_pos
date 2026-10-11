package com.orithos.modules.utility;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/vendor-connections")
public class VendorConnectionController {

    private final VendorConnectionMapper mapper;

    public VendorConnectionController(VendorConnectionMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<List<VendorConnection>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @GetMapping("/{id}")
    public ApiResult<VendorConnection> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<VendorConnection> create(@RequestBody VendorConnection v) {
        mapper.insert(v);
        return ApiResult.ok(v);
    }

    @PutMapping("/{id}")
    public ApiResult<VendorConnection> update(@PathVariable Long id, @RequestBody VendorConnection v) {
        v.setId(id);
        mapper.update(v);
        return ApiResult.ok(v);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.delete(id);
        return ApiResult.ok();
    }
}
