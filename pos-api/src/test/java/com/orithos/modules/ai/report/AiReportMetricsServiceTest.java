package com.orithos.modules.ai.report;

import com.orithos.security.AuthUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiReportMetricsServiceTest {

    @AfterEach
    void clearSecurity() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void clampsWindowAndScopesEveryMapperQueryToCurrentVendor() {
        AiReportAuditMapper mapper = mock(AiReportAuditMapper.class);
        when(mapper.summarize(eq(42L), any())).thenReturn(new AiReportMetricsRow(2, 1, 1, 12.5, 80));
        when(mapper.latencyValues(eq(42L), any())).thenReturn(List.of(10, 20));
        when(mapper.latencyValuesByPath(eq(42L), any())).thenReturn(List.of(
                new AiReportMetricsLatencyRow("assistant:report_sales", 10),
                new AiReportMetricsLatencyRow("assistant:report_sales", 20)));
        when(mapper.summarizeByPath(eq(42L), any())).thenReturn(List.of(
                new AiReportMetricsPathRow("assistant:report_sales", 2, 1, 1, 12.5, 80)));
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        new AuthUser(7L, "admin", true, 3L, 42L), null, Set.of()));

        AiReportMetricsResponse lower = new AiReportMetricsService(mapper).get(0);
        AiReportMetricsResponse upper = new AiReportMetricsService(mapper).get(999);

        assertEquals(1, lower.windowHours());
        assertEquals(168, upper.windowHours());
        assertEquals(50.0, lower.summary().allowedRate());
        // Nearest-rank: ceil(0.5 * 2) - 1 => index 0 => 10; p95 => index 1 => 20.
        assertEquals(10, lower.summary().p50LatencyMs());
        assertEquals(20, lower.summary().p95LatencyMs());
        verify(mapper, times(2)).summarize(eq(42L), any());
        verify(mapper, times(2)).latencyValues(eq(42L), any());
        verify(mapper, times(2)).latencyValuesByPath(eq(42L), any());
        verify(mapper, times(2)).summarizeByPath(eq(42L), any());
    }
}
