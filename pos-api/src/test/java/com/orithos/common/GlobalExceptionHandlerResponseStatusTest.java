package com.orithos.common;

import com.orithos.tenant.PlatformFailureEventService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import jakarta.servlet.http.HttpServletRequest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;

class GlobalExceptionHandlerResponseStatusTest {

    private static final String RETIRED_MESSAGE = "Source-to-native report parity is owned by the crawler";

    @Test
    void preservesResponseStatusExceptionStatusAndReason() throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new RetiredEndpoint())
                .setControllerAdvice(new GlobalExceptionHandler(mock(PlatformFailureEventService.class)))
                .build();

        mvc.perform(get("/retired"))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.code").value(41000))
                .andExpect(jsonPath("$.message").value(RETIRED_MESSAGE));
    }

    @Test
    void hidesServerErrorReasonAndRecordsFailure() throws Exception {
        PlatformFailureEventService failureEvents = mock(PlatformFailureEventService.class);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ServerErrorEndpoint())
                .setControllerAdvice(new GlobalExceptionHandler(failureEvents))
                .build();

        mvc.perform(get("/server-error"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value(50000))
                .andExpect(jsonPath("$.message").value("Unexpected server error."));

        verify(failureEvents).record(any(HttpServletRequest.class), eq(500), eq(50000),
                any(ResponseStatusException.class));
    }

    @RestController
    static class RetiredEndpoint {
        @GetMapping("/retired")
        void retired() {
            throw new ResponseStatusException(HttpStatus.GONE, RETIRED_MESSAGE);
        }
    }

    @RestController
    static class ServerErrorEndpoint {
        @GetMapping("/server-error")
        void fail() {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Sensitive internal reason");
        }
    }
}
