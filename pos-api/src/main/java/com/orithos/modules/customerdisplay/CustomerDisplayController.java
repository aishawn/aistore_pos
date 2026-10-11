package com.orithos.modules.customerdisplay;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/customer-displays")
public class CustomerDisplayController {

    private final CustomerDisplayMapper mapper;

    public CustomerDisplayController(CustomerDisplayMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<List<CustomerDisplay>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @GetMapping("/{id}")
    public ApiResult<CustomerDisplay> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<CustomerDisplay> create(@RequestBody CustomerDisplay c) {
        mapper.insert(c);
        return ApiResult.ok(c);
    }

    @PutMapping("/{id}")
    public ApiResult<CustomerDisplay> update(@PathVariable Long id, @RequestBody CustomerDisplay c) {
        c.setId(id);
        mapper.update(c);
        return ApiResult.ok(c);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.delete(id);
        return ApiResult.ok();
    }

    @PostMapping("/{id}/clone")
    public ApiResult<CustomerDisplay> clone(@PathVariable Long id) {
        CustomerDisplay c = mapper.findById(id);
        if (c == null) return ApiResult.ok(null);
        c.setName(c.getName() + " (copy)");
        mapper.insert(c);
        return ApiResult.ok(c);
    }
}
