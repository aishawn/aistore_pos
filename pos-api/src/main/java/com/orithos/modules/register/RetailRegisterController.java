package com.orithos.modules.register;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/retail/registers")
public class RetailRegisterController {
    private final RegisterSessionService service;
    public RetailRegisterController(RegisterSessionService service) { this.service = service; }

    @GetMapping
    public ApiResult<List<Register>> list() { return ApiResult.ok(service.list()); }

    @GetMapping("/{registerId}/sessions/current")
    public ApiResult<RegisterSession> current(@PathVariable Long registerId) {
        return ApiResult.ok(service.current(registerId));
    }

    @PostMapping("/{registerId}/sessions")
    public ApiResult<RegisterSession> open(@PathVariable Long registerId,
                                           @RequestHeader("Idempotency-Key") String key,
                                           @RequestBody OpenRequest body) {
        return ApiResult.ok(service.open(registerId, key, body.openingFloat()));
    }

    @PostMapping("/sessions/{sessionId}/cash-movements")
    public ApiResult<RegisterCashMovement> move(@PathVariable Long sessionId,
                                                @RequestHeader("Idempotency-Key") String key,
                                                @RequestBody CashMovementRequest body) {
        return ApiResult.ok(service.moveCash(sessionId, key, body.type(), body.amount(), body.reason()));
    }

    @PostMapping("/{registerId}/sessions/close")
    public ApiResult<RegisterClosure> close(@PathVariable Long registerId,
                                            @RequestHeader("Idempotency-Key") String key,
                                            @RequestBody CloseRequest body) {
        return ApiResult.ok(service.close(registerId, key, body.countedCash(), body.countedTenders(), body.note()));
    }

    public record OpenRequest(BigDecimal openingFloat) {}
    public record CashMovementRequest(String type, BigDecimal amount, String reason) {}
    public record CloseRequest(BigDecimal countedCash, Map<Long, BigDecimal> countedTenders, String note) {}
}
