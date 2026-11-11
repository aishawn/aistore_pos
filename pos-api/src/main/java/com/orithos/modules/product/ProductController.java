package com.orithos.modules.product;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.common.PageResult;
import com.orithos.common.PriceQuantityUtils;
import com.orithos.modules.product.mapper.ProductCompetitionPriceMapper;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.security.CurrentUser;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductMapper mapper;
    private final ProductService productService;
    private final ProductCompetitionPriceMapper competitionPriceMapper;
    private final ProductImportService importService;
    private final ProductActivityService activityService;

    public ProductController(ProductMapper mapper,
                             ProductService productService,
                             ProductCompetitionPriceMapper competitionPriceMapper,
                             ProductImportService importService,
                             ProductActivityService activityService) {
        this.mapper = mapper;
        this.productService = productService;
        this.competitionPriceMapper = competitionPriceMapper;
        this.importService = importService;
        this.activityService = activityService;
    }

    @GetMapping
    public ApiResult<PageResult<Product>> list(ProductQuery q) {
        Long vendorId = CurrentUser.vendorId();
        Long outletId = CurrentUser.outletId();
        if (vendorId == null || outletId == null) {
            throw new BusinessException(40100, "Authenticated vendor and outlet are required.");
        }
        q.setVendorId(vendorId);
        q.setOutletId(outletId);
        q.normalize();
        var items = mapper.page(q);
        return ApiResult.ok(PageResult.of(items, mapper.count(q), q.getPage(), q.getSize()));
    }

    /** Full-catalog Inventory On Hand footer totals for the current product filters. */
    @GetMapping("/on-hand-summary")
    public ApiResult<ProductOnHandSummary> onHandSummary(ProductQuery q) {
        Long vendorId = CurrentUser.vendorId();
        Long outletId = CurrentUser.outletId();
        if (vendorId == null || outletId == null) {
            throw new BusinessException(40100, "Authenticated vendor and outlet are required.");
        }
        q.setVendorId(vendorId);
        q.setOutletId(outletId);
        q.normalize();
        ProductOnHandSummary summary = mapper.onHandSummary(q);
        return ApiResult.ok(summary != null ? summary : new ProductOnHandSummary());
    }

    /**
     * Facets for Products filters: only values that appear on at least one non-deleted product
     * in the caller's outlet (so soft-deleted categories like "Beer Local" still show when
     * products reference them).
     */
    @GetMapping("/filter-options")
    public ApiResult<ProductFilterOptions> filterOptions() {
        Long vendorId = CurrentUser.vendorId();
        Long outletId = CurrentUser.outletId();
        if (vendorId == null || outletId == null) {
            throw new BusinessException(40100, "Authenticated vendor and outlet are required.");
        }
        ProductFilterOptions options = new ProductFilterOptions();
        options.setBrands(mapper.listBrandFilterOptions(vendorId, outletId));
        options.setCategories(mapper.listCategoryFilterOptions(vendorId, outletId));
        options.setFamilies(mapper.listFamilyFilterOptions(vendorId, outletId));
        options.setTags(mapper.listTagFilterOptions(vendorId, outletId));
        options.setSuppliers(mapper.listSupplierFilterOptions(vendorId, outletId));
        options.setTypes(mapper.listTypeFilterOptions(vendorId, outletId));
        options.setTaxRates(mapper.listTaxRateFilterOptions(vendorId, outletId));
        options.setCostTaxRates(mapper.listCostTaxRateFilterOptions(vendorId, outletId));
        return ApiResult.ok(options);
    }

    @GetMapping("/import-template")
    public ResponseEntity<byte[]> importTemplate() throws IOException {
        byte[] xlsx = importService.importTemplateXlsx();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"products-import-template.xlsx\"")
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(xlsx);
    }

    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResult<ProductImportResult> importCsv(@RequestParam("file") MultipartFile file)
            throws IOException {
        return ApiResult.ok(importService.importCsv(file));
    }

    @GetMapping("/barcodes/check")
    public ApiResult<ProductService.BarcodeAvailability> checkBarcode(
            @RequestParam String code,
            @RequestParam(required = false) Long excludeProductId) {
        return ApiResult.ok(productService.checkBarcodeAvailability(code, excludeProductId));
    }

    @GetMapping("/{id}/activity-chart")
    public ApiResult<ProductActivityService.Chart> activityChart(@PathVariable Long id) {
        return ApiResult.ok(activityService.chart(id));
    }

    @GetMapping("/{id}/sales")
    public ApiResult<List<ProductActivityMapper.SaleLine>> productSales(@PathVariable Long id) {
        return ApiResult.ok(activityService.sales(id));
    }

    @GetMapping("/{id}/purchases")
    public ApiResult<List<ProductActivityMapper.OrderLine>> productPurchases(@PathVariable Long id) {
        return ApiResult.ok(activityService.purchases(id));
    }

    @GetMapping("/{id}/transfers")
    public ApiResult<List<ProductActivityMapper.OrderLine>> productTransfers(@PathVariable Long id) {
        return ApiResult.ok(activityService.transfers(id));
    }

    @GetMapping("/{id}/inventory-log")
    public ApiResult<List<ProductActivityService.InventoryEvent>> inventoryLog(@PathVariable Long id) {
        return ApiResult.ok(activityService.inventoryLog(id));
    }

    @GetMapping("/{id}/revisions")
    public ApiResult<PageResult<ProductRevision>> revisions(@PathVariable Long id,
                                                            @RequestParam(defaultValue = "1") int page,
                                                            @RequestParam(defaultValue = "50") int size) {
        var items = productService.getRevisions(id, page, size);
        return ApiResult.ok(PageResult.of(items, productService.getRevisionCount(id), page, size));
    }

    @GetMapping("/{id}")
    public ApiResult<Product> get(@PathVariable Long id) {
        Product product = mapper.findById(id);
        if (product != null) {
            enrichProduct(id, product);
        }
        return ApiResult.ok(product);
    }

    private void enrichProduct(Long id, Product product) {
        product.setTagIds(mapper.findTagIdsByProductId(id));
        product.setSupplierIds(mapper.findSupplierIdsByProductId(id));
        product.setBarcodes(mapper.findBarcodesByProductId(id));
        product.setStockQuantity(mapper.sumInventoryByProductId(id));
        product.setPrices(mapper.findPricesByProductId(id));
        if (product.getFamilyId() != null) {
            product.setFamilyMemberNames(mapper.findFamilyMemberNames(product.getFamilyId(), id));
        }
    }

    @PostMapping
    public ApiResult<Product> create(@RequestBody Product p) {
        return ApiResult.ok(productService.create(p));
    }

    @PutMapping("/{id}")
    @Transactional
    public ApiResult<Product> update(@PathVariable Long id, @RequestBody Product p) {
        p.setId(id);
        Product saved = productService.update(p);
        enrichProduct(id, saved);
        return ApiResult.ok(saved);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        productService.delete(id);
        return ApiResult.ok();
    }

    @PostMapping("/bulk-delete")
    @Transactional
    public ApiResult<Void> bulkDelete(@RequestBody List<Long> ids) {
        productService.bulkDelete(ids);
        return ApiResult.ok();
    }

    /**
     * Merge the given source products INTO {id}: reassign transactional history
     * (sale items, order lines, stocktake counts, barcodes, future prices/costs) to
     * the target, then soft-delete the sources. Config junction rows (inventory, cost,
     * price, tags, suppliers) stay with the soft-deleted source and are filtered out by
     * the deleted_at guards on normal reads.
     */
    @PutMapping("/{id}/merge")
    @Transactional
    public ApiResult<Void> merge(@PathVariable Long id, @RequestBody MergeRequest body) {
        if (body != null && body.sourceIds() != null) {
            for (Long src : body.sourceIds()) {
                if (src == null || src.equals(id)) continue;
                mapper.reassignSaleItem(id, src);
                mapper.reassignOrderProduct(id, src);
                mapper.reassignStocktakeProduct(id, src);
                mapper.reassignBarcode(id, src);
                mapper.reassignFuturePrice(id, src);
                mapper.reassignFutureCost(id, src);
                mapper.softDelete(src);
            }
        }
        return ApiResult.ok();
    }

    public record MergeRequest(List<Long> sourceIds) {}

    // ---- inventory adjustment ----
    @PostMapping("/{id}/adjust-inventory")
    public ApiResult<Void> adjustInventory(@PathVariable Long id, @RequestBody AdjustInventoryRequest body) {
        mapper.adjustInventory(id, body.outletId(), body.quantity());
        return ApiResult.ok();
    }

    public record AdjustInventoryRequest(Long outletId, BigDecimal quantity) {}

    // ---- inventory ----
    @GetMapping("/{id}/inventory")
    public ApiResult<List<ProductInventory>> listInventory(@PathVariable Long id) {
        return ApiResult.ok(mapper.findInventoryByProductId(id));
    }

    @PutMapping("/{id}/inventory")
    @Transactional
    public ApiResult<List<ProductInventory>> setInventory(@PathVariable Long id,
                                                          @RequestBody SetInventoryRequest body) {
        if (body != null && body.rows() != null) {
            for (InventoryRow row : body.rows()) {
                if (row.outletId() == null) continue;
                ProductInventory inv = new ProductInventory();
                inv.setOutletId(row.outletId());
                inv.setQuantity(row.quantity() != null ? row.quantity() : BigDecimal.ZERO);
                inv.setReorderLevel(row.reorderLevel());
                inv.setReorderAmount(row.reorderAmount());
                inv.setReorderLimit(row.reorderLimit());
                inv.setMaxQuantity(row.maxQuantity());
                inv.setReorderRounding(row.reorderRounding() != null ? row.reorderRounding() : "NONE");
                mapper.upsertInventory(id, inv);
            }
        }
        return ApiResult.ok(mapper.findInventoryByProductId(id));
    }

    public record InventoryRow(Long outletId,
                               BigDecimal quantity,
                               BigDecimal reorderLevel,
                               BigDecimal reorderAmount,
                               BigDecimal reorderLimit,
                               BigDecimal maxQuantity,
                               String reorderRounding) {}

    public record SetInventoryRequest(List<InventoryRow> rows) {}

    // ---- barcodes ----
    @PostMapping("/{id}/barcodes")
    public ApiResult<Void> associateBarcode(@PathVariable Long id, @RequestBody BarcodeRequest body) {
        productService.associateBarcode(id, body.barcode());
        return ApiResult.ok();
    }

    @DeleteMapping("/{id}/barcodes")
    public ApiResult<Void> deleteBarcodes(@PathVariable Long id, @RequestBody List<Long> barcodeIds) {
        if (barcodeIds != null) {
            for (Long barcodeId : barcodeIds) {
                if (barcodeId != null) mapper.deleteBarcode(barcodeId);
            }
        }
        return ApiResult.ok();
    }

    public record BarcodeRequest(String barcode) {}

    // ---- tags ----
    @PostMapping("/{id}/tags")
    public ApiResult<Void> associateTag(@PathVariable Long id, @RequestBody TagRequest body) {
        mapper.insertTag(id, body.tagId());
        return ApiResult.ok();
    }

    /** Replace the full set of tags associated with this product. */
    @PutMapping("/{id}/tags")
    @Transactional
    public ApiResult<Void> setTags(@PathVariable Long id, @RequestBody SetTagsRequest body) {
        mapper.deleteTagsByProduct(id);
        if (body != null && body.tagIds() != null) {
            for (Long tagId : body.tagIds()) {
                if (tagId != null) mapper.insertTag(id, tagId);
            }
        }
        return ApiResult.ok();
    }

    public record TagRequest(Long tagId) {}

    public record SetTagsRequest(List<Long> tagIds) {}

    // ---- suppliers ----
    @PutMapping("/{id}/suppliers")
    @Transactional
    public ApiResult<Void> setSuppliers(@PathVariable Long id, @RequestBody SetSuppliersRequest body) {
        mapper.deleteSuppliersByProduct(id);
        if (body != null && body.supplierIds() != null) {
            for (Long supplierId : body.supplierIds()) {
                if (supplierId != null) mapper.insertSupplier(id, supplierId);
            }
        }
        return ApiResult.ok();
    }

    public record SetSuppliersRequest(List<Long> supplierIds) {}

    // ---- prices ----
    @PutMapping("/{id}/price")
    public ApiResult<Void> setDefaultPrice(@PathVariable Long id, @RequestBody SetPriceRequest body) {
        if (body == null || body.price() == null) return ApiResult.ok();
        PriceQuantityUtils.validatePrice(body.price());
        Long priceId = mapper.findDefaultPriceId(id);
        if (priceId != null) {
            mapper.updatePriceById(priceId, body.price());
        } else {
            mapper.insertDefaultPrice(id, body.price());
        }
        return ApiResult.ok();
    }

    public record SetPriceRequest(BigDecimal price) {}
    @PostMapping("/{id}/prices")
    public ApiResult<Void> addPrice(@PathVariable Long id, @RequestBody PriceRequest body) {
        PriceQuantityUtils.validateRow(
                body != null ? body.quantity() : null,
                body != null ? body.price() : null);
        mapper.insertPrice(id, body.quantity(), body.price());
        return ApiResult.ok();
    }

    public record PriceRequest(BigDecimal quantity, BigDecimal price) {}

    @GetMapping("/{id}/prices")
    public ApiResult<List<ProductPrice>> listPrices(@PathVariable Long id) {
        return ApiResult.ok(mapper.findPricesByProductId(id));
    }

    /** Replace the full price-point table for this product. */
    @PutMapping("/{id}/prices")
    @Transactional
    public ApiResult<List<ProductPrice>> setPrices(@PathVariable Long id,
                                                   @RequestBody SetPricesRequest body) {
        List<PriceRow> incoming = body != null && body.prices() != null ? body.prices() : List.of();
        List<ProductPrice> existing = mapper.findPricesByProductId(id);
        List<Long> keepIds = new ArrayList<>();

        for (PriceRow row : incoming) {
            if (row.quantity() == null || row.price() == null) continue;
            PriceQuantityUtils.validateRow(row.quantity(), row.price());
            if (row.id() != null) {
                mapper.updatePriceRow(row.id(), row.quantity(), row.price());
                keepIds.add(row.id());
            } else {
                mapper.insertPrice(id, row.quantity(), row.price());
            }
        }

        for (ProductPrice ep : existing) {
            if (ep.getId() != null && !keepIds.contains(ep.getId())) {
                mapper.deletePriceById(id, ep.getId());
            }
        }

        return ApiResult.ok(mapper.findPricesByProductId(id));
    }

    @DeleteMapping("/{id}/prices/{priceId}")
    public ApiResult<Void> deletePrice(@PathVariable Long id, @PathVariable Long priceId) {
        mapper.deletePriceById(id, priceId);
        return ApiResult.ok();
    }

    public record PriceRow(Long id, BigDecimal quantity, BigDecimal price) {}

    public record SetPricesRequest(List<PriceRow> prices) {}

    // ---- competition prices ----
    @GetMapping("/{id}/competition-prices")
    public ApiResult<List<ProductCompetitionPrice>> listCompetitionPrices(@PathVariable Long id) {
        return ApiResult.ok(competitionPriceMapper.findByProduct(id));
    }

    @PostMapping("/{id}/competition-prices")
    public ApiResult<ProductCompetitionPrice> addProductCompetitionPrice(@PathVariable Long id,
                                                                         @RequestBody ProductCompetitionPrice body) {
        body.setProductId(id);
        if (body.getCreatedAt() == null) body.setCreatedAt(LocalDateTime.now());
        competitionPriceMapper.insert(body);
        return ApiResult.ok(body);
    }

    @DeleteMapping("/competition-prices/{priceId}")
    public ApiResult<Void> removeProductCompetitionPrice(@PathVariable Long priceId) {
        competitionPriceMapper.deleteById(priceId);
        return ApiResult.ok();
    }

    // ---- associate product (placeholder) ----
    @PostMapping("/{id}/associate")
    public ApiResult<Void> associateProduct(@PathVariable Long id, @RequestBody AssociateRequest body) {
        // TODO: needs product_association model
        return ApiResult.ok();
    }

    public record AssociateRequest(String associatedProductId) {}
}
