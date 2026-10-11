package com.orithos.modules.giftcard;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/gift-cards")
public class GiftCardController {

    private final GiftCardMapper mapper;
    private final GiftCardImportService importService;
    private final GiftCardExportService exportService;

    public GiftCardController(GiftCardMapper mapper,
                              GiftCardImportService importService,
                              GiftCardExportService exportService) {
        this.mapper = mapper;
        this.importService = importService;
        this.exportService = exportService;
    }

    @GetMapping
    public ApiResult<PageResult<GiftCard>> list(@RequestParam(required = false) String code,
                                                @RequestParam(required = false) Boolean redeemedExpiredOnly,
                                                @RequestParam(required = false) Long outletId,
                                                @RequestParam(defaultValue = "1") int page,
                                                @RequestParam(defaultValue = "10") int size) {
        int offset = Math.max(0, (page - 1) * size);
        var items = mapper.page(code, redeemedExpiredOnly, outletId, size, offset);
        return ApiResult.ok(PageResult.of(items, mapper.count(code, redeemedExpiredOnly, outletId), page, size));
    }

    @GetMapping("/movements")
    public ApiResult<PageResult<GiftCardMovement>> movements(@RequestParam(defaultValue = "1") int page,
                                                             @RequestParam(defaultValue = "10") int size) {
        int offset = Math.max(0, (page - 1) * size);
        var items = mapper.pageMovements(size, offset);
        return ApiResult.ok(PageResult.of(items, mapper.countMovements(), page, size));
    }

    @GetMapping("/export")
    public ResponseEntity<byte[]> export(@RequestParam(required = false) String code,
                                         @RequestParam(required = false) Boolean redeemedExpiredOnly,
                                         @RequestParam(required = false) Long outletId) throws IOException {
        byte[] xlsx = exportService.exportXlsx(code, redeemedExpiredOnly, outletId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"gift-cards.xlsx\"")
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(xlsx);
    }

    @GetMapping("/import-template")
    public ResponseEntity<byte[]> importTemplate() throws IOException {
        byte[] xlsx = importService.importTemplateXlsx();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"gift-cards-import-template.xlsx\"")
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(xlsx);
    }

    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResult<GiftCardImportResult> importCsv(@RequestParam("file") MultipartFile file)
            throws IOException {
        return ApiResult.ok(importService.importCsv(file));
    }

    @GetMapping("/{id}")
    public ApiResult<GiftCard> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<GiftCard> create(@RequestBody GiftCard g) {
        g.setCurrentAmount(g.getOriginalAmount());
        if (g.getStatus() == null) g.setStatus("ACTIVE");
        mapper.insert(g);
        return ApiResult.ok(g);
    }

    @PutMapping("/{id}")
    public ApiResult<GiftCard> update(@PathVariable Long id, @RequestBody GiftCard g) {
        g.setId(id);
        mapper.update(g);
        return ApiResult.ok(g);
    }

    @PostMapping("/{id}/movements")
    public ApiResult<GiftCardMovement> addMovement(@PathVariable Long id, @RequestBody GiftCardMovement m) {
        m.setGiftCardId(id);
        if (m.getTimestamp() == null) m.setTimestamp(LocalDateTime.now());
        mapper.insertMovement(m);
        return ApiResult.ok(m);
    }
}
