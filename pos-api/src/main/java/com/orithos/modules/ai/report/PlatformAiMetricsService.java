package com.orithos.modules.ai.report;

import com.orithos.common.BusinessException;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import com.orithos.tenant.PlatformAccessService;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class PlatformAiMetricsService {

    private final AiReportAuditMapper auditMapper;
    private final VendorMapper vendorMapper;
    private final PlatformAccessService platformAccess;

    public PlatformAiMetricsService(AiReportAuditMapper auditMapper,
                                    VendorMapper vendorMapper,
                                    PlatformAccessService platformAccess) {
        this.auditMapper = auditMapper;
        this.vendorMapper = vendorMapper;
        this.platformAccess = platformAccess;
    }

    public Map<String, Object> usage(int requestedHours) {
        platformAccess.requirePlatformAdmin();
        int hours = Math.max(1, Math.min(requestedHours, 24 * 7));
        LocalDateTime generatedAt = LocalDateTime.now(ZoneOffset.UTC);
        LocalDateTime since = generatedAt.minusHours(hours);

        List<AiPlatformVendorMetricsRow> rows = auditMapper.summarizeByVendor(since);
        long totalRequests = 0;
        long totalAllowed = 0;
        long totalRejected = 0;
        long totalTokens = 0;
        double latencyWeighted = 0;
        List<Integer> allLatencies = new ArrayList<>();
        List<Map<String, Object>> byStore = new ArrayList<>();

        for (AiPlatformVendorMetricsRow row : rows) {
            Vendor vendor = vendorMapper.findById(row.vendorId());
            if (vendor == null) continue;
            totalRequests += row.requests();
            totalAllowed += row.allowed();
            totalRejected += row.rejected();
            totalTokens += row.estimatedTokens();
            latencyWeighted += row.averageLatencyMs() * row.requests();
            List<Integer> latencies = auditMapper.latencyValues(row.vendorId(), since);
            allLatencies.addAll(latencies);
            Integer p95 = percentile(latencies, 0.95);

            Map<String, Object> store = new LinkedHashMap<>();
            store.put("vendorId", row.vendorId());
            store.put("storeName", vendor.getName());
            store.put("subdomain", vendor.getSubdomain());
            store.put("status", vendor.getStatus());
            store.put("requests", row.requests());
            store.put("allowed", row.allowed());
            store.put("rejected", row.rejected());
            store.put("allowedRate", rate(row.allowed(), row.requests()));
            store.put("averageLatencyMs", round(row.averageLatencyMs()));
            store.put("p95LatencyMs", p95);
            store.put("estimatedTokens", row.estimatedTokens());
            store.put("lastSeenAt", row.lastSeenAt());
            byStore.add(store);
        }

        allLatencies.sort(Integer::compareTo);
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("storesWithActivity", byStore.size());
        summary.put("requests", totalRequests);
        summary.put("allowed", totalAllowed);
        summary.put("rejected", totalRejected);
        summary.put("allowedRate", rate(totalAllowed, totalRequests));
        summary.put("averageLatencyMs", totalRequests == 0 ? 0 : round(latencyWeighted / totalRequests));
        summary.put("p95LatencyMs", percentile(allLatencies, 0.95));
        summary.put("estimatedTokens", totalTokens);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("windowHours", hours);
        body.put("since", since);
        body.put("generatedAt", generatedAt);
        body.put("summary", summary);
        body.put("byStore", byStore);
        return body;
    }

    public Map<String, Object> storeKpi(long vendorId, int requestedHours) {
        platformAccess.requirePlatformAdmin();
        Vendor vendor = vendorMapper.findById(vendorId);
        if (vendor == null) {
            throw new BusinessException(40410, "Store not found");
        }
        int hours = Math.max(1, Math.min(requestedHours, 24 * 7));
        LocalDateTime since = LocalDateTime.now(ZoneOffset.UTC).minusHours(hours);
        AiReportMetricsRow row = auditMapper.summarize(vendorId, since);
        List<Integer> latencies = auditMapper.latencyValues(vendorId, since);
        LocalDateTime lastSeen = null;
        for (AiPlatformVendorMetricsRow v : auditMapper.summarizeByVendor(since)) {
            if (v.vendorId() == vendorId) {
                lastSeen = v.lastSeenAt();
                break;
            }
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("vendorId", vendorId);
        body.put("windowHours", hours);
        body.put("requests", row.requests());
        body.put("allowedRate", rate(row.allowed(), row.requests()));
        body.put("p95LatencyMs", percentile(latencies, 0.95));
        body.put("lastSeenAt", lastSeen);
        return body;
    }

    private static double rate(long numerator, long denominator) {
        return denominator == 0 ? 0 : round(numerator * 100.0 / denominator);
    }

    private static double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private static Integer percentile(List<Integer> sorted, double fraction) {
        if (sorted == null || sorted.isEmpty()) return null;
        List<Integer> copy = new ArrayList<>(sorted);
        copy.sort(Integer::compareTo);
        int index = (int) Math.ceil(fraction * copy.size()) - 1;
        return copy.get(Math.max(0, Math.min(index, copy.size() - 1)));
    }
}
