package com.orithos.modules.utility;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationMapper mapper;

    public NotificationController(NotificationMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<PageResult<Notification>> list(@RequestParam(defaultValue = "1") int page,
                                                    @RequestParam(defaultValue = "20") int size) {
        int offset = Math.max(0, (page - 1) * size);
        var items = mapper.page(size, offset);
        return ApiResult.ok(PageResult.of(items, mapper.count(), page, size));
    }

    @PostMapping
    public ApiResult<Notification> create(@RequestBody Notification n) {
        mapper.insert(n);
        return ApiResult.ok(n);
    }

    @PutMapping("/{id}/read")
    public ApiResult<Void> markRead(@PathVariable Long id) {
        mapper.markRead(id);
        return ApiResult.ok();
    }

    @PutMapping("/read-all")
    public ApiResult<Void> markAllRead() {
        mapper.markAllRead();
        return ApiResult.ok();
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.delete(id);
        return ApiResult.ok();
    }

    @DeleteMapping
    public ApiResult<Void> deleteAll() {
        mapper.deleteAll();
        return ApiResult.ok();
    }
}
