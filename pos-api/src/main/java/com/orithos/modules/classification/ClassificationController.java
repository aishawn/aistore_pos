package com.orithos.modules.classification;

import com.orithos.common.ApiResult;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Brand / Category / Family / Tag CRUD for the authenticated outlet.
 *   GET    /api/classifications/{type}
 *   POST   /api/classifications/{type}
 *   PUT    /api/classifications/{type}/{id}
 *   DELETE /api/classifications/{type}/{id}
 *   PUT    /api/classifications/{type}/{id}/products
 * where {type} = brand | category | family | tag.
 */
@RestController
@RequestMapping("/api/classifications")
public class ClassificationController {

    private final ClassificationService service;

    public ClassificationController(ClassificationService service) {
        this.service = service;
    }

    @GetMapping("/{type}")
    public ApiResult<List<Classification>> list(@PathVariable String type,
                                                @RequestParam(required = false) String name,
                                                HttpServletResponse response) {
        // Prevent intermediary caches from retaining retired-route 410 responses.
        response.setHeader("Cache-Control", "no-store");
        return ApiResult.ok(service.list(type, name));
    }

    @GetMapping("/{type}/mdb-references")
    public ApiResult<List<MdbReference>> mdbReferences(@PathVariable String type) {
        return ApiResult.ok(service.mdbReferences(type));
    }

    @GetMapping("/{type}/{id}")
    public ApiResult<Classification> get(@PathVariable String type, @PathVariable Long id) {
        return ApiResult.ok(service.get(type, id));
    }

    @PostMapping("/{type}")
    public ApiResult<Classification> create(@PathVariable String type, @RequestBody Classification body) {
        return ApiResult.ok(service.create(type, body));
    }

    @PutMapping("/{type}/{id}")
    public ApiResult<Classification> update(@PathVariable String type, @PathVariable Long id,
                                            @RequestBody Classification body) {
        return ApiResult.ok(service.update(type, id, body));
    }

    @DeleteMapping("/{type}/{id}")
    public ApiResult<Void> delete(@PathVariable String type, @PathVariable Long id) {
        service.delete(type, id);
        return ApiResult.ok();
    }

    /** Replace the full set of products assigned to this classification. */
    @PutMapping("/{type}/{id}/products")
    public ApiResult<Void> setProducts(@PathVariable String type, @PathVariable Long id,
                                       @RequestBody AssignProductsRequest body) {
        service.setProducts(type, id, body != null ? body.productIds() : List.of());
        return ApiResult.ok();
    }

    public record AssignProductsRequest(List<Long> productIds) {}
}
