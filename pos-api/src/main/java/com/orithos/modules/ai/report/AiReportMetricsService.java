package com.orithos.modules.ai.report;

import com.orithos.security.AdminAccess;
import com.orithos.security.AuthUser;
import com.orithos.security.CurrentUser;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class AiReportMetricsService {

    private final AiReportAuditMapper mapper;

    public AiReportMetricsService(AiReportAuditMapper mapper) {
        this.mapper = mapper;
    }

    public AiReportMetricsResponse get(int requestedHours) {
        AdminAccess.requireAdmin();
        int hours = Math.max(1, Math.min(requestedHours, 24 * 7));
        LocalDateTime generatedAt = LocalDateTime.now(ZoneOffset.UTC);
        LocalDateTime since = generatedAt.minusHours(hours);
        AuthUser user = CurrentUser.get();
        long vendorId = user.vendorId() == null ? TenantContext.DEFAULT_VENDOR_ID : user.vendorId();
        return buildForVendor(vendorId, hours, since, generatedAt);
    }

    /**
     * Admin-only, non-sensitive schema diagnostics for investigating missing
     * audit metrics without exposing database connection details.
     */
    public Map<String, Object> auditDiagnostics() {
        AdminAccess.requireAdmin();
        AuthUser user = CurrentUser.get();
        long vendorId = user.vendorId() == null ? TenantContext.DEFAULT_VENDOR_ID : user.vendorId();
        Map<String, Object> result = new LinkedHashMap<>();
        try {
            result.put("tableExists", mapper.auditTableExists());
            result.put("allowedColumnType", mapper.allowedColumnType());
            result.put("insertPrivilege", mapper.auditInsertPrivilege());
            result.put("totalRows", mapper.auditRowCount());
            result.put("vendorRows", mapper.auditVendorRowCount(vendorId));
            result.put("vendorId", vendorId);
        } catch (RuntimeException error) {
            result.put("diagnosticError", error.getClass().getSimpleName());
        }
        return result;
    }

    /** Platform rollup helper — no admin gate; caller must enforce platform access. */
    public AiReportMetricsResponse forVendor(long vendorId, int requestedHours) {
        int hours = Math.max(1, Math.min(requestedHours, 24 * 7));
        LocalDateTime generatedAt = LocalDateTime.now(ZoneOffset.UTC);
        LocalDateTime since = generatedAt.minusHours(hours);
        return buildForVendor(vendorId, hours, since, generatedAt);
    }

    /**
     * Read-only diagnostics for operators troubleshooting an empty metrics rollup.
     * Counts are queried only after confirming the audit table exists so this endpoint
     * remains useful during first-time migrations.
     */
    public Map<String, Object> auditDiagnostics() {
        AdminAccess.requireAdmin();
        Map<String, Object> result = new LinkedHashMap<>();
        boolean tableExists = mapper.auditTableExists();
        result.put("tableExists", tableExists);
        result.put("allowedColumnType", mapper.allowedColumnType());
        result.put("insertPrivilege", tableExists && mapper.auditInsertPrivilege());
        result.put("databaseCurrentTime", mapper.databaseCurrentTime());
        if (tableExists) {
            result.put("rowCount", mapper.auditRowCount());
            result.put("latestCreatedAt", mapper.auditLatestCreatedAt());
            AuthUser user = CurrentUser.get();
            long vendorId = user.vendorId() == null ? TenantContext.DEFAULT_VENDOR_ID : user.vendorId();
            result.put("vendorId", vendorId);
            result.put("vendorRowCount", mapper.auditVendorRowCount(vendorId));
            result.put("vendorLatestCreatedAt", mapper.auditVendorLatestCreatedAt(vendorId));
        }
        return result;
    }

    private AiReportMetricsResponse buildForVendor(long vendorId, int hours,
                                                   LocalDateTime since, LocalDateTime generatedAt) {
        AiReportMetricsRow row = mapper.summarize(vendorId, since);
        List<Integer> latencies = mapper.latencyValues(vendorId, since);
        Map<String, List<Integer>> pathLatencies = mapper.latencyValuesByPath(vendorId, since).stream()
                .filter(sample -> sample.latencyMs() != null)
                .collect(Collectors.groupingBy(
                        AiReportMetricsLatencyRow::path,
                        LinkedHashMap::new,
                        Collectors.mapping(AiReportMetricsLatencyRow::latencyMs, Collectors.toList())
                ));
        List<AiReportMetricsResponse.PathMetric> byPath = mapper.summarizeByPath(vendorId, since).stream()
                .map(path -> new AiReportMetricsResponse.PathMetric(
                        path.path(),
                        path.requests(),
                        path.allowed(),
                        path.rejected(),
                        rate(path.allowed(), path.requests()),
                        round(path.averageLatencyMs()),
                        percentile(pathLatencies.get(path.path()), 0.50),
                        percentile(pathLatencies.get(path.path()), 0.95),
                        path.estimatedTokens()
                ))
                .toList();

        LocalDateTime since24h = generatedAt.minusHours(24);
        AiReportMetricsRow day = hours <= 24 ? row : mapper.summarize(vendorId, since24h);
        List<AiReportMetricsResponse.PathMetric> topIntents = byPath.stream()
                .filter(p -> p.path() != null && p.path().startsWith("assistant:"))
                .limit(5)
                .toList();
        if (topIntents.isEmpty()) {
            topIntents = byPath.stream().limit(5).toList();
        }

        return new AiReportMetricsResponse(
                hours,
                since,
                generatedAt,
                new AiReportMetricsResponse.Summary(
                        row.requests(),
                        row.allowed(),
                        row.rejected(),
                        rate(row.allowed(), row.requests()),
                        round(row.averageLatencyMs()),
                        percentile(latencies, 0.50),
                        percentile(latencies, 0.95),
                        row.estimatedTokens(),
                        true
                ),
                byPath,
                new AiReportMetricsResponse.Highlights(
                        day.requests(),
                        day.rejected(),
                        rate(day.rejected(), day.requests()),
                        topIntents
                )
        );
    }

    private static double rate(long numerator, long denominator) {
        return denominator == 0 ? 0 : round(numerator * 100.0 / denominator);
    }

    private static double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private static Integer percentile(List<Integer> sorted, double fraction) {
        if (sorted == null || sorted.isEmpty()) return null;
        int index = (int) Math.ceil(fraction * sorted.size()) - 1;
        return sorted.get(Math.max(0, Math.min(index, sorted.size() - 1)));
    }
}
