package com.orithos.common;

import com.orithos.tenant.PlatformFailureEventService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class GlobalExceptionHandlerFailureTest {

    private final PlatformFailureEventService failureEvents = mock(PlatformFailureEventService.class);
    private final GlobalExceptionHandler handler = new GlobalExceptionHandler(failureEvents);

    @Test
    void unexpectedServerErrorsAreRecordedAndDoNotExposeExceptionMessages() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/odoo/products");
        IllegalStateException failure = new IllegalStateException("database password=secret");

        var response = handler.generic(failure, request);

        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        assertEquals("Unexpected server error.", response.getBody().message());
        verify(failureEvents).record(request, 500, 50000, failure);
    }

    @Test
    void applicationServerFailureCodesAreRecordedWithActualHttpStatus() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/ai/ask");
        BusinessException failure = new BusinessException(50210, "AI provider unavailable");

        handler.business(failure, request);

        verify(failureEvents).record(request, 200, 50210, failure);
    }
}
