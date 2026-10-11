package com.orithos.modules.pushdevice;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/push-devices")
public class PushDeviceController {

    private final PushDeviceMapper mapper;

    public PushDeviceController(PushDeviceMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<List<PushDevice>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @GetMapping("/{id}")
    public ApiResult<PushDevice> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<PushDevice> create(@RequestBody PushDevice d) {
        mapper.insert(d);
        return ApiResult.ok(d);
    }

    @PutMapping("/{id}")
    public ApiResult<PushDevice> update(@PathVariable Long id, @RequestBody PushDevice d) {
        d.setId(id);
        mapper.update(d);
        return ApiResult.ok(d);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.delete(id);
        return ApiResult.ok();
    }
}
