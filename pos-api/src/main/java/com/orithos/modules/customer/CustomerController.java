package com.orithos.modules.customer;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import com.orithos.common.SqlLikeUtils;
import com.orithos.modules.customer.mapper.CustomerGroupMapper;
import com.orithos.modules.customer.mapper.CustomerMapper;
import com.orithos.security.CurrentUser;
import com.orithos.common.BusinessException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/customers")
public class CustomerController {

    private final CustomerMapper customerMapper;
    private final CustomerGroupMapper groupMapper;
    private final CustomerExportService exportService;
    private final CustomerImportService importService;
    private final CustomerService customerService;
    private final CustomerStatementService statementService;
    private final CustomerGroupRevisionService groupRevisionService;
    private final CustomerGroupService customerGroupService;

    public CustomerController(CustomerMapper customerMapper,
                              CustomerGroupMapper groupMapper,
                              CustomerExportService exportService,
                              CustomerImportService importService,
                              CustomerService customerService,
                              CustomerStatementService statementService,
                              CustomerGroupRevisionService groupRevisionService,
                              CustomerGroupService customerGroupService) {
        this.customerMapper = customerMapper;
        this.groupMapper = groupMapper;
        this.exportService = exportService;
        this.importService = importService;
        this.customerService = customerService;
        this.statementService = statementService;
        this.groupRevisionService = groupRevisionService;
        this.customerGroupService = customerGroupService;
    }

    @GetMapping
    public ApiResult<PageResult<Customer>> list(@RequestParam(required = false) String name,
                                                @RequestParam(required = false) Long groupId,
                                                @RequestParam(required = false) String groupIds,
                                                @RequestParam(required = false) String priceListId,
                                                @RequestParam(required = false) BigDecimal minOwing,
                                                @RequestParam(required = false) BigDecimal maxOwing,
                                                @RequestParam(required = false) LocalDate asOf,
                                                @RequestParam(defaultValue = "1") int page,
                                                @RequestParam(defaultValue = "10") int size) {
        requireOutlet();
        GroupFilter filter = parseGroupFilter(groupIds, groupId);
        PriceListFilter priceListFilter = parsePriceListFilter(priceListId);
        String search = normalizeSearch(name);
        LocalDateTime asOfEnd = asOf != null ? asOf.plusDays(1).atStartOfDay() : null;
        return ApiResult.ok(customerService.list(
                search, filter.ids(), filter.includeNoGroup(), filter.active(),
                priceListFilter.id(), priceListFilter.noPriceList(), priceListFilter.active(),
                minOwing, maxOwing, asOfEnd, page, size));
    }

    private static Long requireOutlet() {
        Long outletId = CurrentUser.outletId();
        if (outletId == null) throw new BusinessException(40100, "Authenticated outlet is required.");
        return outletId;
    }

    /** Comma-separated group ids; use {@code __none__} to include customers with no group. */
    private static GroupFilter parseGroupFilter(String groupIds, Long groupId) {
        String raw = groupIds;
        if (raw == null || raw.isBlank()) {
            raw = groupId != null ? String.valueOf(groupId) : null;
        }
        if (raw == null || raw.isBlank()) {
            return new GroupFilter(List.of(), false, false);
        }

        List<Long> ids = new ArrayList<>();
        boolean includeNoGroup = false;
        for (String part : raw.split(",")) {
            String token = part.trim();
            if (token.isEmpty()) continue;
            if ("__none__".equals(token) || "none".equalsIgnoreCase(token)) {
                includeNoGroup = true;
            } else {
                ids.add(Long.parseLong(token));
            }
        }
        return new GroupFilter(ids, includeNoGroup, !ids.isEmpty() || includeNoGroup);
    }

    private record GroupFilter(List<Long> ids, boolean includeNoGroup, boolean active) {}

    /** Use {@code __none__} to filter customers with no price list. */
    private static PriceListFilter parsePriceListFilter(String priceListId) {
        if (priceListId == null || priceListId.isBlank()) {
            return new PriceListFilter(null, false, false);
        }
        String token = priceListId.trim();
        if ("__none__".equals(token) || "none".equalsIgnoreCase(token)) {
            return new PriceListFilter(null, true, true);
        }
        return new PriceListFilter(Long.parseLong(token), false, true);
    }

    private record PriceListFilter(Long id, boolean noPriceList, boolean active) {}

    /** Trim search text, escape LIKE wildcards; blank input is treated as no filter. */
    private static String normalizeSearch(String value) {
        return SqlLikeUtils.prepareLikeSearch(value);
    }

    @GetMapping("/statements/preview")
    public ApiResult<CustomerStatementsPreview> statementsPreview(
            @RequestParam Long templateId,
            @RequestParam LocalDate start,
            @RequestParam LocalDate end,
            @RequestParam(required = false) Long customerId,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) Long groupId,
            @RequestParam(required = false) String groupIds) {
        GroupFilter filter = parseGroupFilter(groupIds, groupId);
        return ApiResult.ok(statementService.preview(
                templateId, start, end, normalizeSearch(name),
                filter.ids(), filter.includeNoGroup(), filter.active(), customerId));
    }

    @GetMapping("/export")
    public ResponseEntity<byte[]> export(@RequestParam(defaultValue = "simple") String level,
                                         @RequestParam(required = false) String name,
                                         @RequestParam(required = false) Long groupId,
                                         @RequestParam(required = false) String groupIds) {
        GroupFilter filter = parseGroupFilter(groupIds, groupId);
        byte[] csv = exportService.exportCsv(
                level, normalizeSearch(name), filter.ids(), filter.includeNoGroup(), filter.active());
        String filename = "simple".equalsIgnoreCase(level) ? "customers-simple.csv" : "customers-full.csv";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(csv);
    }

    @GetMapping("/{id}/recent-sales")
    public ApiResult<List<CustomerRecentSaleLine>> recentSales(@PathVariable Long id,
                                                               @RequestParam(defaultValue = "10") int limit) {
        return ApiResult.ok(customerService.getRecentSaleLines(id, limit));
    }

    @GetMapping("/{id}/revisions")
    public ApiResult<PageResult<CustomerRevision>> revisions(@PathVariable Long id,
                                                             @RequestParam(defaultValue = "1") int page,
                                                             @RequestParam(defaultValue = "50") int size) {
        var items = customerService.getRevisions(id, page, size);
        return ApiResult.ok(PageResult.of(items, customerService.getRevisionCount(id), page, size));
    }

    @GetMapping("/{id}")
    public ApiResult<CustomerDetail> get(@PathVariable Long id) {
        return ApiResult.ok(customerService.getDetail(id));
    }

    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResult<CustomerImportResult> importCsv(@RequestParam("file") MultipartFile file)
            throws IOException {
        return ApiResult.ok(importService.importCsv(file));
    }

    @PostMapping
    public ApiResult<CustomerDetail> create(@RequestBody CustomerDetail detail) {
        return ApiResult.ok(customerService.create(detail));
    }

    @PutMapping("/{id}")
    public ApiResult<CustomerDetail> update(@PathVariable Long id, @RequestBody CustomerDetail detail) {
        return ApiResult.ok(customerService.update(id, detail));
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        customerService.softDelete(id);
        return ApiResult.ok();
    }

    /**
     * Merge the given source customers INTO {id}: reassign sales, payments and vendor
     * connections to the target, then soft-delete the sources. Note: account balances
     * (current_owing / loyalty_points) are NOT auto-summed — reassigned sales/payments
     * already carry the history, and summing would double-count.
     */
    @PutMapping("/{id}/merge")
    @Transactional
    public ApiResult<Void> merge(@PathVariable Long id, @RequestBody MergeRequest body) {
        if (body != null && body.sourceIds() != null) {
            for (Long src : body.sourceIds()) {
                if (src == null || src.equals(id)) continue;
                customerMapper.reassignSaleCustomer(id, src);
                customerMapper.reassignPaymentCustomer(id, src);
                customerMapper.reassignVendorConnectionCustomer(id, src);
                customerService.softDelete(src);
            }
        }
        return ApiResult.ok();
    }

    public record MergeRequest(List<Long> sourceIds) {}

    // ----- customer groups -----
    @GetMapping("/groups")
    public ApiResult<PageResult<CustomerGroup>> groups(@RequestParam(required = false) String name,
                                                       @RequestParam(defaultValue = "1") int page,
                                                       @RequestParam(defaultValue = "10") int size) {
        int offset = Math.max(0, (page - 1) * size);
        String search = normalizeSearch(name);
        Long outletId = requireOutlet();
        var items = groupMapper.page(search, outletId, size, offset);
        return ApiResult.ok(PageResult.of(items, groupMapper.count(search, outletId), page, size));
    }

    @GetMapping("/groups/{id}")
    public ApiResult<CustomerGroup> getGroup(@PathVariable Long id) {
        CustomerGroup group = groupMapper.findByIdAndOutlet(id, requireOutlet());
        if (group == null) throw new BusinessException(40410, "Customer group not found.");
        return ApiResult.ok(group);
    }

    @GetMapping("/groups/{id}/revisions")
    public ApiResult<PageResult<CustomerGroupRevision>> groupRevisions(@PathVariable Long id,
                                                                       @RequestParam(defaultValue = "1") int page,
                                                                       @RequestParam(defaultValue = "50") int size) {
        Long outletId = requireOutlet();
        CustomerGroup group = groupMapper.findByIdAndOutlet(id, outletId);
        if (group == null) throw new BusinessException(40410, "Customer group not found.");
        var items = groupRevisionService.list(id, page, size);
        return ApiResult.ok(PageResult.of(items, groupRevisionService.count(id), page, size));
    }

    @PostMapping("/groups")
    public ApiResult<CustomerGroup> createGroup(@RequestBody CustomerGroup g) {
        return ApiResult.ok(customerGroupService.create(g));
    }

    @PutMapping("/groups/{id}")
    public ApiResult<CustomerGroup> updateGroup(@PathVariable Long id, @RequestBody CustomerGroup g) {
        return ApiResult.ok(customerGroupService.update(id, g));
    }

    @DeleteMapping("/groups/{id}")
    public ApiResult<Void> deleteGroup(@PathVariable Long id) {
        Long outletId = requireOutlet();
        if (groupMapper.softDelete(id, outletId) == 0) throw new BusinessException(40410, "Customer group not found.");
        return ApiResult.ok();
    }
}
