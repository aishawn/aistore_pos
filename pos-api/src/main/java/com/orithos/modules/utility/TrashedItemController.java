package com.orithos.modules.utility;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/trashed-items")
public class TrashedItemController {

    private final TrashedItemMapper mapper;

    public TrashedItemController(TrashedItemMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<PageResult<TrashedItem>> list(@RequestParam(required = false) String type,
                                                   @RequestParam(name = "q", required = false) String query,
                                                   @RequestParam(defaultValue = "1") int page,
                                                   @RequestParam(defaultValue = "20") int size) {
        int offset = Math.max(0, (page - 1) * size);
        String normalizedQuery = query == null || query.isBlank() ? null : query.trim();
        var items = mapper.page(type, normalizedQuery, size, offset);
        return ApiResult.ok(PageResult.of(items, mapper.count(type, normalizedQuery), page, size));
    }

    @PostMapping("/{id}/recover")
    public ApiResult<Void> recover(@PathVariable Long id) {
        return ApiResult.ok();
    }
}
