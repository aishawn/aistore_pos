package com.orithos.modules.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ShopfrontIntegrationControllerTest {

    @Test
    void stagingFailureDoesNotExposeDatabaseErrorDetails() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.update(anyString())).thenThrow(new IllegalStateException("database password=secret"));
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);
        var body = new ObjectMapper().readTree("{\"store_key\":\"test\",\"items\":[]}");

        ResponseStatusException failure = assertThrows(ResponseStatusException.class,
                () -> controller.products("token", body));

        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, failure.getStatusCode());
        assertEquals("Unable to stage Shopfront import", failure.getReason());
        assertFalse(failure.getMessage().contains("password=secret"));
    }
}
