package com.orithos.modules.utility;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/mail-log")
public class MailLogController {

    private final MailLogMapper mapper;

    public MailLogController(MailLogMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<PageResult<MailLog>> list(@RequestParam(required = false) String recipient,
                                               @RequestParam(defaultValue = "1") int page,
                                               @RequestParam(defaultValue = "20") int size) {
        int offset = Math.max(0, (page - 1) * size);
        var items = mapper.page(recipient, size, offset);
        return ApiResult.ok(PageResult.of(items, mapper.count(recipient), page, size));
    }

    @GetMapping("/{id}")
    public ApiResult<MailLog> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }
}
