package com.orithos.modules.quickmenu;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/quick-menu")
public class QuickMenuController {

    private final QuickMenuItemMapper mapper;

    public QuickMenuController(QuickMenuItemMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<List<QuickMenuItem>> list(@RequestParam(required = false) Long userId) {
        return ApiResult.ok(mapper.findAll(userId));
    }

    @PostMapping
    public ApiResult<QuickMenuItem> addQuickMenuItem(@RequestBody QuickMenuItem q) {
        if (q.getExternal() == null) q.setExternal(false);
        if (q.getPosition() == null) q.setPosition(0);
        mapper.insert(q);
        return ApiResult.ok(q);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> removeQuickMenuItem(@PathVariable Long id) {
        mapper.delete(id);
        return ApiResult.ok();
    }
}
