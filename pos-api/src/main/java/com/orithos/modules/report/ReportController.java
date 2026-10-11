package com.orithos.modules.report;

import com.orithos.common.ApiResult;
import com.orithos.common.AustraliaTime;
import com.orithos.modules.ai.report.TenantContextFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Saved report CRUD plus POST /api/reports which runs real aggregates via {@link ReportQueryService}.
 */
@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private final RedisTemplate<String, Object> redis;
    private final ReportMapper reportMapper;
    private final ReportQueryService reportQueryService;
    private final TenantContextFactory tenantContextFactory;

    public ReportController(RedisTemplate<String, Object> redis, ReportMapper reportMapper,
                            ReportQueryService reportQueryService,
                            TenantContextFactory tenantContextFactory) {
        this.redis = redis;
        this.reportMapper = reportMapper;
        this.reportQueryService = reportQueryService;
        this.tenantContextFactory = tenantContextFactory;
    }

    @GetMapping("/daily-sales")
    public ApiResult<DailySalesReport> dailySales() {
        var tenant = tenantContextFactory.fromSecurity();
        Long outletId = tenant.requireOutletId();
        if (outletId == null) {
            return ApiResult.ok(DailySalesReport.of(AustraliaTime.today(), null, null, 0));
        }
        return ApiResult.ok(reportQueryService.dailySales(outletId, AustraliaTime.today()));
    }

    @GetMapping("/weekly-sales")
    public ApiResult<List<DailySalesReport>> weeklySales() {
        var tenant = tenantContextFactory.fromSecurity();
        Long outletId = tenant.requireOutletId();
        LocalDate today = AustraliaTime.today();
        if (outletId == null) {
            return ApiResult.ok(ReportQueryService.weekThroughToday(today));
        }
        return ApiResult.ok(reportQueryService.weeklySales(outletId, today));
    }

    @GetMapping("/last-week-sales")
    public ApiResult<DailySalesReport> lastWeekSales() {
        var tenant = tenantContextFactory.fromSecurity();
        Long outletId = tenant.requireOutletId();
        if (outletId == null) {
            return ApiResult.ok(ReportQueryService.lastWeekEmpty());
        }
        return ApiResult.ok(reportQueryService.lastWeekSales(outletId, AustraliaTime.today()));
    }

    @GetMapping("/last-month-sales")
    public ApiResult<DailySalesReport> lastMonthSales() {
        var tenant = tenantContextFactory.fromSecurity();
        Long outletId = tenant.requireOutletId();
        if (outletId == null) {
            return ApiResult.ok(ReportQueryService.lastMonthEmpty());
        }
        return ApiResult.ok(reportQueryService.lastMonthSales(outletId, AustraliaTime.today()));
    }

    @GetMapping("/this-month-sales")
    public ApiResult<List<DailySalesReport>> thisMonthSales() {
        var tenant = tenantContextFactory.fromSecurity();
        Long outletId = tenant.requireOutletId();
        LocalDate today = AustraliaTime.today();
        if (outletId == null) {
            return ApiResult.ok(ReportQueryService.thisMonthThroughToday(today));
        }
        return ApiResult.ok(reportQueryService.thisMonthSales(outletId, today));
    }

    // ---- saved reports ----
    @GetMapping
    public ApiResult<List<Report>> list() {
        return ApiResult.ok(reportMapper.findAll());
    }

    @GetMapping("/{id:\\d+}")
    public ApiResult<Report> get(@PathVariable Long id) {
        return ApiResult.ok(reportMapper.findById(id));
    }

    @PostMapping("/save")
    public ApiResult<Report> saveReport(@RequestBody Report r) {
        if (r.getSpecial() == null) r.setSpecial(false);
        reportMapper.insert(r);
        return ApiResult.ok(r);
    }

    @PostMapping("/save-special")
    public ApiResult<Report> saveSpecialReport(@RequestBody Report r) {
        r.setSpecial(true);
        reportMapper.insert(r);
        return ApiResult.ok(r);
    }

    @PutMapping("/{id}")
    public ApiResult<Report> update(@PathVariable Long id, @RequestBody Report r) {
        r.setId(id);
        reportMapper.update(r);
        return ApiResult.ok(r);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> deleteReport(@PathVariable Long id) {
        reportMapper.delete(id);
        return ApiResult.ok();
    }

    @PutMapping("/{id}/email-settings")
    public ApiResult<Void> updateReportEmailSettings(@PathVariable Long id,
                                                     @RequestBody EmailSettingsRequest body) {
        reportMapper.updateEmailSettings(id, body.emailSettings());
        return ApiResult.ok();
    }

    @GetMapping("/{id}/filter")
    public ApiResult<String> getReportFilter(@PathVariable Long id) {
        Report r = reportMapper.findById(id);
        return ApiResult.ok(r == null ? null : r.getFilter());
    }

    public record EmailSettingsRequest(String emailSettings) {}

    @PostMapping
    @SuppressWarnings("unchecked")
    public ApiResult<Map<String, Object>> run(@RequestBody Map<String, Object> req) {
        Map<String, Object> cache = (Map<String, Object>) req.getOrDefault("cache", Map.of());
        String cacheId = cache.get("id") != null ? cache.get("id").toString() : null;

        if (cacheId != null) {
            Object cached = redis.opsForValue().get("report:" + cacheId);
            if (cached instanceof Map<?, ?> m) {
                return ApiResult.ok((Map<String, Object>) m);
            }
        }

        Map<String, Object> payload = reportQueryService.runDsl(
                String.valueOf(req.getOrDefault("query", "")),
                tenantContextFactory.fromSecurity());

        if (cacheId != null) {
            redis.opsForValue().set("report:" + cacheId, payload, Duration.ofMinutes(30));
        }
        return ApiResult.ok(payload);
    }
}
