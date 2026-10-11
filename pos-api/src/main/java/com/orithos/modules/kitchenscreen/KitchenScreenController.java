package com.orithos.modules.kitchenscreen;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/kitchen-screens")
public class KitchenScreenController {

    private final KitchenScreenMapper mapper;

    public KitchenScreenController(KitchenScreenMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<List<KitchenScreen>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @GetMapping("/{id}")
    public ApiResult<KitchenScreen> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<KitchenScreen> create(@RequestBody KitchenScreen k) {
        mapper.insert(k);
        return ApiResult.ok(k);
    }

    @PutMapping("/{id}")
    public ApiResult<KitchenScreen> update(@PathVariable Long id, @RequestBody KitchenScreen k) {
        k.setId(id);
        mapper.update(k);
        return ApiResult.ok(k);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.delete(id);
        return ApiResult.ok();
    }
}
