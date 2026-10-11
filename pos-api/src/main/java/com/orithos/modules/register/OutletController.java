package com.orithos.modules.register;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/outlets")
public class OutletController {

    private final OutletMapper mapper;

    public OutletController(OutletMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<List<Outlet>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @GetMapping("/{id}")
    public ApiResult<Outlet> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<Outlet> create(@RequestBody Outlet o) {
        if (o.getLoyaltyEnabled() == null) o.setLoyaltyEnabled(false);
        if (o.getHasKitchenScreen() == null) o.setHasKitchenScreen(false);
        mapper.insert(o);
        return ApiResult.ok(o);
    }

    @PutMapping("/{id}")
    public ApiResult<Outlet> update(@PathVariable Long id, @RequestBody Outlet o) {
        o.setId(id);
        mapper.update(o);
        return ApiResult.ok(o);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.softDelete(id);
        return ApiResult.ok();
    }
}
