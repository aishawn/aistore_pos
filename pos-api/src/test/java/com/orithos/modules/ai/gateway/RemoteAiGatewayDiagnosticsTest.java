package com.orithos.modules.ai.gateway;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class RemoteAiGatewayDiagnosticsTest {

    @Test
    void extractsProviderStatusAndRootCauseTypeWithoutUsingMessages() {
        RuntimeException failure = new IllegalStateException("do not log prompt text",
                HttpClientErrorException.create(HttpStatus.TOO_MANY_REQUESTS, "private response body",
                        org.springframework.http.HttpHeaders.EMPTY, new byte[0], null));

        assertEquals(429, RemoteAiGateway.providerStatus(failure));
        assertEquals("TooManyRequests", RemoteAiGateway.rootCauseType(failure));
    }

    @Test
    void reportsMissingProviderStatusAsNull() {
        assertNull(RemoteAiGateway.providerStatus(new IllegalStateException("private message")));
    }
}
