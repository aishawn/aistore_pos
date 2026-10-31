package com.orithos.modules.ai.command;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiCommandRepositoryTest {
    @Mock
    JdbcTemplate jdbc;

    @InjectMocks
    AiCommandRepository repository;

    @Test
    void bindsExpiryAsJdbcTimestampForPostgres() {
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        Instant expiresAt = Instant.parse("2026-10-30T00:00:00Z");

        repository.insert(UUID.randomUUID(), 1L, 2L, 3L, "UPDATE_PRODUCT", "PREVIEWED",
                "{}", "rename product", "thread", expiresAt, "version", "idempotency");

        ArgumentCaptor<Object[]> values = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(anyString(), values.capture());
        assertInstanceOf(Timestamp.class, values.getValue()[9]);
    }

    @Test
    void cancellationAllowsDraftAndPreviewedCommandsOnly() {
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);

        repository.cancelPreview(UUID.randomUUID(), "version");

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).update(sql.capture(), any(Object[].class));
        assertTrue(sql.getValue().contains("status IN (?, ?)"));
    }
}
