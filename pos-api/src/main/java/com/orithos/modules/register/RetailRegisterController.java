package com.orithos.modules.register;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.config.NativePosGate;
import com.orithos.modules.config.CompanySettingsService;
import com.orithos.security.CurrentUser;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api/retail/registers")
public class RetailRegisterController {
    private final RegisterSessionService service;
    private final NativePosGate nativePosGate;
    private final CompanySettingsService companySettings;
    private final ObjectMapper objectMapper;
    public RetailRegisterController(RegisterSessionService service, NativePosGate nativePosGate,
                                    CompanySettingsService companySettings, ObjectMapper objectMapper) {
        this.service = service;
        this.nativePosGate = nativePosGate;
        this.companySettings = companySettings;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/cash-reason-options")
    public ApiResult<CashReasonOptions> cashReasonOptions() {
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) throw new BusinessException(40100, "Authenticated tenant is required.");
        return ApiResult.ok(new CashReasonOptions(
                parseOptions(companySettings.getString("company.sell.cash_in_reasons", vendorId, "[]")),
                parseOptions(companySettings.getString("company.sell.cash_out_reasons", vendorId, "[]"))));
    }

    private List<String> parseOptions(String raw) {
        try {
            JsonNode parsed = objectMapper.readTree(raw);
            if (parsed == null || !parsed.isArray()) return List.of();
            Map<String, String> unique = new LinkedHashMap<>();
            for (JsonNode item : parsed) {
                if (!item.isTextual()) continue;
                String value = item.asText().trim();
                if (!value.isEmpty()) unique.putIfAbsent(value.toLowerCase(Locale.ROOT), value);
            }
            return new ArrayList<>(unique.values());
        } catch (JsonProcessingException ignored) {
            return List.of();
        }
    }

    @GetMapping
    public ApiResult<List<Register>> list() { return ApiResult.ok(service.list()); }

    @GetMapping("/{registerId}/sessions/current")
    public ApiResult<RegisterSession> current(@PathVariable Long registerId) {
        return ApiResult.ok(service.current(registerId));
    }

    @GetMapping("/{registerId}/sessions/current/summary")
    public ApiResult<RegisterSessionSummary> summary(@PathVariable Long registerId) {
        return ApiResult.ok(service.summary(registerId));
    }

    @PostMapping("/{registerId}/sessions")
    public ApiResult<RegisterSession> open(@PathVariable Long registerId,
                                           @RequestHeader("Idempotency-Key") String key,
                                           @RequestBody OpenRequest body) {
        nativePosGate.requireEnabled();
        return ApiResult.ok(service.open(registerId, key, body.openingFloat()));
    }

    @PostMapping("/sessions/{sessionId}/cash-movements")
    public ApiResult<RegisterCashMovement> move(@PathVariable Long sessionId,
                                                @RequestHeader("Idempotency-Key") String key,
                                                @RequestBody CashMovementRequest body) {
        nativePosGate.requireEnabled();
        return ApiResult.ok(service.moveCash(sessionId, key, body.type(), body.amount(), body.reason()));
    }

    @PostMapping("/{registerId}/sessions/close")
    public ApiResult<RegisterClosure> close(@PathVariable Long registerId,
                                            @RequestHeader("Idempotency-Key") String key,
                                            @RequestBody CloseRequest body) {
        nativePosGate.requireEnabled();
        return ApiResult.ok(service.close(registerId, key, body.countedCash(), body.countedTenders(), body.note()));
    }

    public record OpenRequest(BigDecimal openingFloat) {}
    public record CashMovementRequest(String type, BigDecimal amount, String reason) {}
    public record CloseRequest(BigDecimal countedCash, Map<Long, BigDecimal> countedTenders, String note) {}
    public record CashReasonOptions(List<String> cashInReasons, List<String> cashOutReasons) {}
}
