package com.orithos.modules.integration;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/integrations")
public class IntegrationController {

    private final IntegrationMapper mapper;

    public IntegrationController(IntegrationMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<List<Integration>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @GetMapping("/{id}")
    public ApiResult<Integration> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<Integration> create(@RequestBody Integration i) {
        if (i.getEnabled() == null) {
            i.setEnabled(false);
        }
        mapper.insert(i);
        return ApiResult.ok(i);
    }

    @PutMapping("/{id}")
    public ApiResult<Integration> update(@PathVariable Long id, @RequestBody Integration i) {
        i.setId(id);
        mapper.update(i);
        return ApiResult.ok(i);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.delete(id);
        return ApiResult.ok();
    }
}
