package com.orithos.modules.config;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/transferees")
public class TransfereeController {

    private final TransfereeMapper mapper;

    public TransfereeController(TransfereeMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<List<Transferee>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @GetMapping("/{id}")
    public ApiResult<Transferee> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<Transferee> create(@RequestBody Transferee t) {
        if (t.getOrderAutomaticEmail() == null) t.setOrderAutomaticEmail(false);
        if (t.getSendOrdersToAccountsFlow() == null) t.setSendOrdersToAccountsFlow(false);
        mapper.insert(t);
        return ApiResult.ok(t);
    }

    @PutMapping("/{id}")
    public ApiResult<Transferee> update(@PathVariable Long id, @RequestBody Transferee t) {
        t.setId(id);
        mapper.update(t);
        return ApiResult.ok(t);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.softDelete(id);
        return ApiResult.ok();
    }
}
