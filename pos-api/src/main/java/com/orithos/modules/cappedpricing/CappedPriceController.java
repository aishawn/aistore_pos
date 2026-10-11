package com.orithos.modules.cappedpricing;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/capped-pricing")
public class CappedPriceController {

    private final CappedPriceService service;
    private final CappedPriceImportService importService;

    public CappedPriceController(CappedPriceService service, CappedPriceImportService importService) {
        this.service = service;
        this.importService = importService;
    }

    @GetMapping
    public ApiResult<PageResult<CappedPriceRow>> list(CappedPriceQuery q) {
        return ApiResult.ok(service.page(q));
    }

    @PatchMapping("/current-price")
    public ApiResult<Void> updateCurrentPrice(@RequestBody CappedPriceService.CurrentPriceUpdate body) {
        service.updateCurrentPrice(body.priceId(), body.price());
        return ApiResult.ok();
    }

    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResult<CappedPriceImportResult> importCsv(@RequestParam("file") MultipartFile file)
            throws IOException {
        return ApiResult.ok(importService.importCsv(file));
    }
}
