package com.orithos.modules.register;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/registers")
public class RegisterController {

    private final RegisterMapper mapper;
    private final RegisterClosureMapper closureMapper;

    public RegisterController(RegisterMapper mapper, RegisterClosureMapper closureMapper) {
        this.mapper = mapper;
        this.closureMapper = closureMapper;
    }

    @GetMapping
    public ApiResult<List<Register>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @GetMapping("/{id}")
    public ApiResult<Register> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<Register> create(@RequestBody Register r) {
        if (r.getClosed() == null) r.setClosed(false);
        mapper.insert(r);
        return ApiResult.ok(r);
    }

    @PutMapping("/{id}")
    public ApiResult<Register> update(@PathVariable Long id, @RequestBody Register r) {
        r.setId(id);
        mapper.update(r);
        return ApiResult.ok(r);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.softDelete(id);
        return ApiResult.ok();
    }

    @PostMapping("/{id}/close")
    public ApiResult<RegisterClosure> close(@PathVariable Long id, @RequestBody CloseRequest body) {
        RegisterClosure c = new RegisterClosure();
        c.setRegisterId(id);
        c.setOpenedAt(body.openTime());
        c.setClosedAt(LocalDateTime.now());
        closureMapper.insert(c);
        return ApiResult.ok(c);
    }

    @PostMapping("/{id}/movements")
    public ApiResult<Void> movement(@PathVariable Long id, @RequestBody MovementRequest body) {
        return ApiResult.ok();
    }

    @PutMapping("/{id}/invoice-number")
    public ApiResult<Void> overrideInvoiceNumber(@PathVariable Long id,
                                                 @RequestBody InvoiceNumberRequest body) {
        mapper.overrideInvoiceNumber(id, body.invoiceNumber());
        return ApiResult.ok();
    }

    @PutMapping("/{id}/surcharging")
    public ApiResult<Void> updateRegisterSurcharging(@PathVariable Long id,
                                                     @RequestBody SurchargingRequest body) {
        mapper.updateSurcharging(id, body.surcharging());
        return ApiResult.ok();
    }

    public record CloseRequest(String note, LocalDateTime openTime, LocalDateTime closeTime) {}

    public record MovementRequest(BigDecimal amount, Long paymentMethodId, String reason) {}

    public record InvoiceNumberRequest(String invoiceNumber) {}

    public record SurchargingRequest(String surcharging) {}
}
