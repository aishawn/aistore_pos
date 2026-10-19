package com.orithos.modules.ai.report;

import com.orithos.security.AdminAccess;
import com.orithos.security.AuthUser;
import com.orithos.security.CurrentUser;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

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
        long vendorId = user.vendorId() == null ? 0L : user.vendorId();
        AiReportMetricsRow row = mapper.summarize(vendorId, since);
        List<Integer> latencies = mapper.latencyValues(vendorId, since);
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
                mapper.summarizeByPath(vendorId, since).stream()
                        .map(path -> new AiReportMetricsResponse.PathMetric(
                                path.path(),
                                path.requests(),
                                path.allowed(),
                                path.rejected(),
                                rate(path.allowed(), path.requests()),
                                round(path.averageLatencyMs()),
                                path.estimatedTokens()
                        ))
                        .toList()
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
