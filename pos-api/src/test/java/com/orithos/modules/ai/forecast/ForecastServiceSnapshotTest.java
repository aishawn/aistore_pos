package com.orithos.modules.ai.forecast;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.ai.report.TenantContext;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class ForecastServiceSnapshotTest {
    private static final TenantContext TENANT = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of());
    private static final ForecastDtos.Response RESPONSE = new ForecastDtos.Response(
            "seasonal_naive_v1", "1", "skr-snapshot-test", 7, List.of());

    @Test
    void persistsTenantScopedCompletedSnapshot() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ForecastService service = new ForecastService(jdbc, mock(ForecastClient.class), new ObjectMapper(), true, 56);

        service.persistSnapshot(TENANT, RESPONSE);

        verify(jdbc).update(any(String.class), any(), org.mockito.ArgumentMatchers.eq(42L),
                org.mockito.ArgumentMatchers.eq(3L), org.mockito.ArgumentMatchers.eq("seasonal_naive_v1"),
                org.mockito.ArgumentMatchers.eq("1"), org.mockito.ArgumentMatchers.eq("skr-snapshot-test"),
                org.mockito.ArgumentMatchers.eq(7), any(),
                org.mockito.ArgumentMatchers.argThat(value -> value.toString().contains("\"sourceVersion\":\"skr-snapshot-test\"")));
    }

    @Test
    void snapshotStorageFailureDoesNotBreakReadonlyForecastResult() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        doThrow(new RuntimeException("database unavailable")).when(jdbc)
                .update(any(String.class), any(), any(), any(), any(), any(), any(), any(), any(), any());
        ForecastService service = new ForecastService(jdbc, mock(ForecastClient.class), new ObjectMapper(), true, 56);

        assertDoesNotThrow(() -> service.persistSnapshot(TENANT, RESPONSE));
    }
}
