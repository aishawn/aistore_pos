package com.orithos.tenant;

import com.orithos.common.BusinessException;
import com.orithos.common.PageResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class PlatformFailureEventControllerTest {

    private PlatformFailureEventService failureEvents;
    private PlatformAccessService platformAccess;
    private PlatformFailureEventController controller;

    @BeforeEach
    void setUp() {
        failureEvents = mock(PlatformFailureEventService.class);
        platformAccess = mock(PlatformAccessService.class);
        controller = new PlatformFailureEventController(failureEvents, platformAccess);
    }

    @Test
    void searchesAggregatedFailuresWithUtcRangeAndBoundedPagination() {
        when(failureEvents.search(12L, "request-123", 502, 50210,
                LocalDateTime.parse("2026-10-20T00:00:00"), LocalDateTime.parse("2026-10-21T00:00:00"), 2, 100))
                .thenReturn(List.of());
        when(failureEvents.count(12L, "request-123", 502, 50210,
                LocalDateTime.parse("2026-10-20T00:00:00"), LocalDateTime.parse("2026-10-21T00:00:00")))
                .thenReturn(4L);

        var result = controller.search(12L, " request-123 ", 502, 50210,
                "2026-10-20T11:00:00+11:00", "2026-10-21T11:00:00+11:00", 2, 500);

        assertEquals(new PageResult<>(List.of(), 4L, 2, 100), result.data());
        verify(platformAccess).requirePlatformAdmin();
    }

    @Test
    void rejectsNonServerHttpStatusFiltersBeforeQuerying() {
        assertThrows(BusinessException.class,
                () -> controller.search(null, null, 404, null, null, null, 1, 50));
        verify(platformAccess).requirePlatformAdmin();
        verifyNoInteractions(failureEvents);
    }

    @Test
    void rejectsReversedTimeRange() {
        assertThrows(BusinessException.class,
                () -> controller.search(null, null, null, null,
                        "2026-10-22T00:00:00Z", "2026-10-21T00:00:00Z", 1, 50));
        verifyNoInteractions(failureEvents);
    }
}
