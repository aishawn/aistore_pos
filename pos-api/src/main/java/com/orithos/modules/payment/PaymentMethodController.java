package com.orithos.modules.payment;

import com.orithos.common.ApiResult;
import com.orithos.security.CurrentUser;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/payment-methods")
public class PaymentMethodController {

    private final PaymentMethodMapper mapper;

    public PaymentMethodController(PaymentMethodMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<List<PaymentMethod>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @GetMapping("/{id}")
    public ApiResult<PaymentMethod> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<PaymentMethod> create(@RequestBody PaymentMethod p) {
        if (p.getOutletId() == null) {
            Long outletId = CurrentUser.outletId();
            p.setOutletId(outletId != null ? outletId : 1L);
        }
        mapper.insert(p);
        return ApiResult.ok(p);
    }

    @PutMapping("/{id}")
    public ApiResult<PaymentMethod> update(@PathVariable Long id, @RequestBody PaymentMethod p) {
        p.setId(id);
        mapper.update(p);
        return ApiResult.ok(p);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.softDelete(id);
        return ApiResult.ok();
    }
}
