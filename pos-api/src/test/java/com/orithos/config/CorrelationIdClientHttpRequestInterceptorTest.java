package com.orithos.config;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class CorrelationIdClientHttpRequestInterceptorTest {

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void forwardsTheRequestCorrelationIdToProviderCalls() {
        String correlationId = UUID.randomUUID().toString();
        MDC.put(RequestCorrelationFilter.MDC_KEY, correlationId);
        RestClient.Builder builder = RestClient.builder()
                .requestInterceptor(new CorrelationIdClientHttpRequestInterceptor());
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://provider.example/test"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header(RequestCorrelationFilter.HEADER, correlationId))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        assertDoesNotThrow(() -> builder.build().get().uri("https://provider.example/test").retrieve().body(String.class));

        server.verify();
    }

    @Test
    void restClientCustomizerInstallsCorrelationInterceptor() {
        String correlationId = UUID.randomUUID().toString();
        MDC.put(RequestCorrelationFilter.MDC_KEY, correlationId);
        RestClient.Builder builder = RestClient.builder();
        new CorrelationIdRestClientConfiguration().correlationIdRestClientCustomizer().customize(builder);
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://provider.example/test"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header(RequestCorrelationFilter.HEADER, correlationId))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        assertDoesNotThrow(() -> builder.build().get().uri("https://provider.example/test").retrieve().body(String.class));

        server.verify();
    }

    @Test
    void restoresMdcFromGraphStateAndClearsItAfterTheNode() throws Exception {
        String correlationId = UUID.randomUUID().toString();

        String observed = CorrelationIdContext.with(correlationId, () -> MDC.get(RequestCorrelationFilter.MDC_KEY));

        assertEquals(correlationId, observed);
        assertNull(MDC.get(RequestCorrelationFilter.MDC_KEY));
    }

    @Test
    void restoresPreviousMdcValueAfterNodeExecution() throws Exception {
        String previous = UUID.randomUUID().toString();
        String correlationId = UUID.randomUUID().toString();
        MDC.put(RequestCorrelationFilter.MDC_KEY, previous);

        String observed = CorrelationIdContext.with(correlationId, () -> MDC.get(RequestCorrelationFilter.MDC_KEY));

        assertEquals(correlationId, observed);
        assertEquals(previous, MDC.get(RequestCorrelationFilter.MDC_KEY));
    }

    @Test
    void doesNotForwardMalformedCorrelationIds() {
        MDC.put(RequestCorrelationFilter.MDC_KEY, "not-a-uuid");
        RestClient.Builder builder = RestClient.builder()
                .requestInterceptor(new CorrelationIdClientHttpRequestInterceptor());
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://provider.example/test"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        assertDoesNotThrow(() -> builder.build().get().uri("https://provider.example/test").retrieve().body(String.class));

        server.verify();
    }
}
