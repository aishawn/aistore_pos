package com.orithos.modules.host;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/host-connections")
public class HostConnectionController {

    private final HostConnectionMapper mapper;

    public HostConnectionController(HostConnectionMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<List<HostConnection>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @GetMapping("/{id}")
    public ApiResult<HostConnection> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<HostConnection> create(@RequestBody HostConnection h) {
        mapper.insert(h);
        return ApiResult.ok(h);
    }

    @PutMapping("/{id}")
    public ApiResult<HostConnection> update(@PathVariable Long id, @RequestBody HostConnection h) {
        h.setId(id);
        mapper.update(h);
        return ApiResult.ok(h);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.delete(id);
        return ApiResult.ok();
    }
}
