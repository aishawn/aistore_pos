package com.orithos.modules.ai.forecast;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ForecastServiceBatchingTest {
    private static ForecastDtos.Series series(long id) {
        return new ForecastDtos.Series(id, List.of(), List.of(), List.of());
    }

    @Test
    void splitsBatchesAtSerializedPayloadByteLimit() {
        List<ForecastDtos.Series> series = List.of(series(1), series(2), series(3), series(4), series(5));

        List<List<ForecastDtos.Series>> batches = ForecastService.batchesByPayloadSize(
                series, 10, 12, 3, ignored -> 4);

        assertEquals(List.of(2, 2, 1), batches.stream().map(List::size).toList());
        assertEquals(List.of(1L, 2L, 3L, 4L, 5L), batches.stream().flatMap(List::stream)
                .map(ForecastDtos.Series::productId).toList());
    }

    @Test
    void respectsProductLimitWhenPayloadIsSmall() {
        List<ForecastDtos.Series> series = List.of(series(1), series(2), series(3), series(4), series(5));

        List<List<ForecastDtos.Series>> batches = ForecastService.batchesByPayloadSize(
                series, 2, 100, 3, ignored -> 1);

        assertEquals(List.of(2, 2, 1), batches.stream().map(List::size).toList());
    }

    @Test
    void rejectsASingleSeriesThatExceedsThePayloadLimit() {
        assertThrows(IllegalArgumentException.class, () -> ForecastService.batchesByPayloadSize(
                List.of(series(1)), 10, 10, 3, ignored -> 8));
    }
}
