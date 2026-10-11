package com.orithos.modules.stocklist;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/stock-list")
public class StockListController {

    private final StockListService service;

    public StockListController(StockListService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResult<PageResult<StockListRow>> list(StockListQuery q) {
        var items = service.page(q);
        return ApiResult.ok(PageResult.of(items, service.count(q), q.getPage(), q.getSize()));
    }

    @GetMapping("/export")
    public ResponseEntity<byte[]> export(StockListQuery q) {
        byte[] csv = service.exportCsv(q);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"stock-list.csv\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(csv);
    }

    @PatchMapping("/{id}")
    public ApiResult<Void> update(@PathVariable Long id, @RequestBody StockListService.StockListUpdate body) {
        service.updateRow(id, body);
        return ApiResult.ok();
    }
}
