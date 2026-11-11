package com.orithos.modules.utility;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
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
        throw disabled();
    }

    @GetMapping("/{id}")
    public ApiResult<VendorConnection> get(@PathVariable Long id) {
        throw disabled();
    }

    @PostMapping
    public ApiResult<VendorConnection> create(@RequestBody VendorConnection v) {
        throw disabled();
    }

    @PutMapping("/{id}")
    public ApiResult<VendorConnection> update(@PathVariable Long id, @RequestBody VendorConnection v) {
        throw disabled();
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        throw disabled();
    }

    /** Classic vendor connections have no tenant key and are no longer supported. */
    private BusinessException disabled() {
        return new BusinessException(41001, "Classic vendor connections are retired; use the Orithos supplier directory.");
    }
}
