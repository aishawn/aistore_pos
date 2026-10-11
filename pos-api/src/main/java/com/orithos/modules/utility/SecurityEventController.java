package com.orithos.modules.utility;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/security-events")
public class SecurityEventController {

    private final SecurityEventMapper mapper;

    public SecurityEventController(SecurityEventMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<PageResult<SecurityEvent>> list(@RequestParam(required = false) String event,
                                                     @RequestParam(defaultValue = "1") int page,
                                                     @RequestParam(defaultValue = "20") int size) {
        int offset = Math.max(0, (page - 1) * size);
        var items = mapper.page(event, size, offset);
        return ApiResult.ok(PageResult.of(items, mapper.count(event), page, size));
    }

    @GetMapping("/{id}")
    public ApiResult<SecurityEvent> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<SecurityEvent> create(@RequestBody SecurityEvent e) {
        if (e.getTimestamp() == null) e.setTimestamp(LocalDateTime.now());
        mapper.insert(e);
        return ApiResult.ok(e);
    }
}
