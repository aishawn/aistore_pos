package com.orithos.modules.ai.invoice;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/invoice-scans")
public class InvoiceScanSessionController {

    private final InvoiceScanSessionService service;

    public InvoiceScanSessionController(InvoiceScanSessionService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResult<InvoiceScanSessionDtos.ListResponse> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset) {
        return ApiResult.ok(service.list(status, query, limit, offset));
    }

    @GetMapping("/{id}")
    public ApiResult<InvoiceScanSessionDtos.SessionView> get(@PathVariable long id) {
        return ApiResult.ok(service.get(id));
    }

    @PostMapping
    public ApiResult<InvoiceScanSessionDtos.SessionView> create(@RequestBody InvoiceScanSessionDtos.SaveRequest request) {
        return ApiResult.ok(service.create(request));
    }

    @PutMapping("/{id}")
    public ApiResult<InvoiceScanSessionDtos.SessionView> patch(
            @PathVariable long id,
            @RequestBody InvoiceScanSessionDtos.PatchRequest request) {
        return ApiResult.ok(service.patch(id, request));
    }

    @PostMapping("/{id}/link-purchase")
    public ApiResult<InvoiceScanSessionDtos.SessionView> linkPurchase(
            @PathVariable long id,
            @RequestBody InvoiceScanSessionDtos.LinkPurchaseRequest request) {
        return ApiResult.ok(service.linkPurchase(id, request));
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> discard(@PathVariable long id) {
        service.discard(id);
        return ApiResult.ok(null);
    }

    @GetMapping("/abn-map")
    public ApiResult<Long> suggestedSupplier(@RequestParam String abn) {
        return ApiResult.ok(service.suggestedSupplierId(abn));
    }
}
