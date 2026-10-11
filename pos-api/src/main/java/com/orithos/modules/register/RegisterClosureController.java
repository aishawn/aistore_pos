package com.orithos.modules.register;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/register-closures")
public class RegisterClosureController {

    private final RegisterClosureMapper mapper;

    public RegisterClosureController(RegisterClosureMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<PageResult<RegisterClosure>> list(@RequestParam(required = false) Long registerId,
                                                       @RequestParam(defaultValue = "1") int page,
                                                       @RequestParam(defaultValue = "20") int size) {
        int offset = Math.max(0, (page - 1) * size);
        var items = mapper.page(registerId, size, offset);
        return ApiResult.ok(PageResult.of(items, mapper.count(registerId), page, size));
    }

    @GetMapping("/{id}")
    public ApiResult<RegisterClosure> get(@PathVariable Long id) {
        RegisterClosure c = mapper.findById(id);
        if (c != null) {
            c.setPayments(mapper.findPaymentsByClosureId(id));
        }
        return ApiResult.ok(c);
    }

    @PutMapping("/{id}/note")
    public ApiResult<Void> addRegisterClosureNote(@PathVariable Long id,
                                                  @RequestBody NoteRequest body) {
        mapper.updateNote(id, body.note());
        return ApiResult.ok();
    }

    public record NoteRequest(String note) {}
}
