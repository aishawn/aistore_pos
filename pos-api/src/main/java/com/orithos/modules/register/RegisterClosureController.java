package com.orithos.modules.register;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.common.PageResult;
import com.orithos.security.CurrentUser;
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
        Long outletId = requireOutlet();
        int offset = Math.max(0, (page - 1) * size);
        var items = mapper.page(outletId, registerId, size, offset);
        return ApiResult.ok(PageResult.of(items, mapper.count(outletId, registerId), page, size));
    }

    @GetMapping("/{id}")
    public ApiResult<RegisterClosure> get(@PathVariable Long id) {
        Long outletId = requireOutlet();
        RegisterClosure c = mapper.findById(id, outletId);
        if (c != null) {
            c.setPayments(mapper.findPaymentsByClosureId(id));
        }
        return ApiResult.ok(c);
    }

    @PutMapping("/{id}/note")
    public ApiResult<Void> addRegisterClosureNote(@PathVariable Long id,
                                                  @RequestBody NoteRequest body) {
        Long outletId = requireOutlet();
        if (mapper.updateNote(id, outletId, body.note()) != 1) {
            throw new BusinessException(40410, "Register closure not found.");
        }
        return ApiResult.ok();
    }

    public record NoteRequest(String note) {}

    private static Long requireOutlet() {
        Long outletId = CurrentUser.outletId();
        if (outletId == null) throw new BusinessException(40100, "Authenticated outlet is required.");
        return outletId;
    }
}
