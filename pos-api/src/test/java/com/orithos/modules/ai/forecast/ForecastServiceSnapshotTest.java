package com.orithos.modules.ai.forecast;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.common.BusinessTimezoneService;
import com.orithos.modules.ai.report.TenantContext;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
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
        ForecastService service = new ForecastService(jdbc, mock(ForecastClient.class), new ObjectMapper(), true, 56, 2000,
                mock(BusinessTimezoneService.class));

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
        ForecastService service = new ForecastService(jdbc, mock(ForecastClient.class), new ObjectMapper(), true, 56, 2000,
                mock(BusinessTimezoneService.class));

        assertDoesNotThrow(() -> service.persistSnapshot(TENANT, RESPONSE));
    }

    @Test
    void disabledForecastFailsBeforeReadingTenantData() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ForecastService service = new ForecastService(jdbc, mock(ForecastClient.class), new ObjectMapper(), false, 56, 2000,
                mock(BusinessTimezoneService.class));

        BusinessException error = assertThrows(BusinessException.class, () -> service.forecast(TENANT, 7));

        assertEquals(50332, error.getCode());
        org.mockito.Mockito.verifyNoInteractions(jdbc);
    }

    @Test
    void acceptsOnlyOrithosLedgerAsForecastInput() {
        assertThrows(BusinessException.class,
                () -> ForecastService.requireVerifiedSourceVersion("unknown"));
        assertThrows(BusinessException.class,
                () -> ForecastService.requireVerifiedSourceVersion(" "));
        assertThrows(BusinessException.class,
                () -> ForecastService.requireVerifiedSourceVersion("odoo-2026-11-01T00:00:00Z"));
        assertDoesNotThrow(() -> ForecastService.requireVerifiedSourceVersion("orithos-ledger-2026-11-01T00:00:00Z"));
    }

    @Test
    void splitsProductSeriesIntoProviderLimitBatchesWithoutDroppingProducts() {
        List<ForecastDtos.Series> series = List.of(
                new ForecastDtos.Series(1, List.of(), List.of(), List.of()),
                new ForecastDtos.Series(2, List.of(), List.of(), List.of()),
                new ForecastDtos.Series(3, List.of(), List.of(), List.of()),
                new ForecastDtos.Series(4, List.of(), List.of(), List.of()),
                new ForecastDtos.Series(5, List.of(), List.of(), List.of()));

        List<List<ForecastDtos.Series>> batches = ForecastService.batches(series, 2);

        assertEquals(List.of(2, 2, 1), batches.stream().map(List::size).toList());
        assertEquals(List.of(1L, 2L, 3L, 4L, 5L), batches.stream().flatMap(List::stream)
                .map(ForecastDtos.Series::productId).toList());
    }

    @Test
    void rejectsNonpositiveBatchSize() {
        assertThrows(IllegalArgumentException.class, () -> ForecastService.batches(List.of(), 0));
    }

    @Test
    void rejectsMissingOrDuplicateForecastProductIds() {
        List<ForecastDtos.Series> requested = List.of(
                new ForecastDtos.Series(1, List.of(), List.of(), List.of()),
                new ForecastDtos.Series(2, List.of(), List.of(), List.of()));
        ForecastDtos.Response missing = new ForecastDtos.Response("model", "1", "source", 7,
                List.of(new ForecastDtos.Item(1, List.of(), "VALID", "HIGH")));
        ForecastDtos.Response duplicate = new ForecastDtos.Response("model", "1", "source", 7,
                List.of(new ForecastDtos.Item(1, List.of(), "VALID", "HIGH"),
                        new ForecastDtos.Item(1, List.of(), "VALID", "HIGH")));

        assertThrows(BusinessException.class, () -> ForecastService.validateBatchCoverage(requested, missing));
        assertThrows(BusinessException.class, () -> ForecastService.validateBatchCoverage(requested, duplicate));
    }
}
