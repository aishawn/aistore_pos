package com.orithos.modules.externalstocktake;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/external-stocktakes")
public class ExternalStocktakeController {

    private final ExternalStocktakeMapper mapper;
    private final ExternalStocktakeService service;

    public ExternalStocktakeController(ExternalStocktakeMapper mapper, ExternalStocktakeService service) {
        this.mapper = mapper;
        this.service = service;
    }

    @GetMapping
    public ApiResult<PageResult<ExternalStocktake>> list(@RequestParam(defaultValue = "1") int page,
                                                         @RequestParam(defaultValue = "10") int size) {
        int offset = Math.max(0, (page - 1) * size);
        var items = mapper.page(size, offset);
        return ApiResult.ok(PageResult.of(items, mapper.count(), page, size));
    }

    @GetMapping("/export")
    public ResponseEntity<byte[]> export(@RequestParam Long outletId,
                                         @RequestParam(defaultValue = "false") boolean includeNoBarcode)
            throws IOException {
        byte[] xlsx = service.exportXlsx(outletId, includeNoBarcode);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"external-stocktake.xlsx\"")
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(xlsx);
    }

    @GetMapping("/import-template")
    public ResponseEntity<byte[]> importTemplate() throws IOException {
        byte[] xlsx = service.importTemplateXlsx();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"external-stocktake-import-template.xlsx\"")
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(xlsx);
    }

    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResult<ExternalStocktake> importFile(@RequestParam("file") MultipartFile file) {
        return ApiResult.ok(service.importFile(file));
    }

    @GetMapping("/{id:\\d+}")
    public ApiResult<ExternalStocktake> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<ExternalStocktake> create(@RequestBody ExternalStocktake e) {
        if (e.getZeroStock() == null) e.setZeroStock(false);
        if (e.getOverrideStock() == null) e.setOverrideStock(false);
        if (e.getStatus() == null) e.setStatus("PENDING");
        mapper.insert(e);
        return ApiResult.ok(e);
    }

    @PutMapping("/{id:\\d+}")
    public ApiResult<ExternalStocktake> update(@PathVariable Long id, @RequestBody ExternalStocktake e) {
        e.setId(id);
        mapper.update(e);
        return ApiResult.ok(e);
    }

    @PutMapping("/{id:\\d+}/complete")
    public ApiResult<Void> complete(@PathVariable Long id) {
        mapper.complete(id);
        return ApiResult.ok();
    }

    @DeleteMapping("/{id:\\d+}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.delete(id);
        return ApiResult.ok();
    }

    @PutMapping("/{id:\\d+}/barcode")
    public ApiResult<Void> updateBarcode(@PathVariable Long id, @RequestBody BarcodeRequest body) {
        // TODO: external stocktake barcode model
        return ApiResult.ok();
    }

    public record BarcodeRequest(String barcode) {}
}
