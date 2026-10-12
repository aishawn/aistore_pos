package com.orithos.modules.supplychain;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;

@RestController
@RequestMapping("/api/supply-chain")
public class SupplyChainController {

    private final SupplyChainService service;

    public SupplyChainController(SupplyChainService service) {
        this.service = service;
    }

    @GetMapping("/plan")
    public ApiResult<SupplyPlanView> plan() {
        return ApiResult.ok(service.currentPlan());
    }

    @PostMapping("/plan/generate")
    public ApiResult<SupplyPlanView> generate() {
        return ApiResult.ok(service.regenerate());
    }

    @PostMapping("/lines/{id}/decision")
    public ApiResult<SupplyPlanView> decision(@PathVariable Long id, @RequestBody DecisionBody body) {
        return ApiResult.ok(service.decide(id, body == null ? null : body.status()));
    }

    @PostMapping("/suppliers/{supplierId}/cart")
    public ApiResult<SupplyChainService.CartResult> cart(@PathVariable Long supplierId) {
        return ApiResult.ok(service.createCart(supplierId));
    }

    @PostMapping("/drafts/{id}/review")
    public ApiResult<SupplyPlanView> reviewDraft(@PathVariable Long id) {
        return ApiResult.ok(service.reviewDraft(id));
    }

    @GetMapping("/settings")
    public ApiResult<SupplySettingsView> settings() {
        return ApiResult.ok(service.settings());
    }

    @PutMapping("/preferences")
    public ApiResult<SupplySettingsView> savePreference(@RequestBody PreferenceBody body) {
        return ApiResult.ok(service.savePreference(body.supplierId(), body.priority(), body.switchThreshold(), body.channel()));
    }

    @DeleteMapping("/preferences/{id}")
    public ApiResult<SupplySettingsView> deletePreference(@PathVariable Long id) {
        return ApiResult.ok(service.deletePreference(id));
    }

    @PostMapping("/prices")
    public ApiResult<SupplySettingsView> addPrice(@RequestBody PriceBody body) {
        return ApiResult.ok(service.addPrice(body.productId(), body.supplierId(), body.supplierSku(), body.basePrice(),
                body.caseSize(), body.effectiveFrom(), body.effectiveTo()));
    }

    @DeleteMapping("/prices/{id}")
    public ApiResult<SupplySettingsView> deletePrice(@PathVariable Long id) {
        return ApiResult.ok(service.deletePrice(id));
    }

    @PostMapping("/deals")
    public ApiResult<SupplySettingsView> addDeal(@RequestBody DealBody body) {
        return ApiResult.ok(service.addDeal(body.supplierId(), body.name(), body.dealType(), body.buyQuantity(),
                body.freeQuantity(), body.discountPercent(), body.discountAmount(), body.eligibleProducts(),
                body.requiresRep(), body.mixMatch(), body.validFrom(), body.validTo()));
    }

    @DeleteMapping("/deals/{id}")
    public ApiResult<SupplySettingsView> deleteDeal(@PathVariable Long id) {
        return ApiResult.ok(service.deleteDeal(id));
    }

    @PutMapping("/rules")
    public ApiResult<SupplySettingsView> saveRule(@RequestBody RuleBody body) {
        return ApiResult.ok(service.saveRule(body.productId(), body.supplierMode(), body.supplierId()));
    }

    @DeleteMapping("/rules/{id}")
    public ApiResult<SupplySettingsView> deleteRule(@PathVariable Long id) {
        return ApiResult.ok(service.deleteRule(id));
    }

    @PostMapping("/events")
    public ApiResult<SupplySettingsView> addEvent(@RequestBody EventBody body) {
        return ApiResult.ok(service.addEvent(body.eventDate(), body.name(), body.adjustmentPercent()));
    }

    @DeleteMapping("/events/{id}")
    public ApiResult<SupplySettingsView> deleteEvent(@PathVariable Long id) {
        return ApiResult.ok(service.deleteEvent(id));
    }

    public record DecisionBody(String status) {
    }

    public record PreferenceBody(Long supplierId, Integer priority, BigDecimal switchThreshold, String channel) {
    }

    public record PriceBody(Long productId, Long supplierId, String supplierSku, BigDecimal basePrice,
                            BigDecimal caseSize, LocalDate effectiveFrom, LocalDate effectiveTo) {
    }

    public record DealBody(Long supplierId, String name, String dealType, Integer buyQuantity, Integer freeQuantity,
                           BigDecimal discountPercent, BigDecimal discountAmount, String eligibleProducts,
                           Boolean requiresRep, Boolean mixMatch, LocalDate validFrom, LocalDate validTo) {
    }

    public record RuleBody(Long productId, String supplierMode, Long supplierId) {
    }

    public record EventBody(LocalDate eventDate, String name, BigDecimal adjustmentPercent) {
    }
}
