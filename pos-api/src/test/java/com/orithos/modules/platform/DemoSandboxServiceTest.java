package com.orithos.modules.platform;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DemoSandboxServiceTest {

    private JdbcTemplate jdbc;
    private DemoSandboxService service;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        service = new DemoSandboxService(jdbc, new ShopfrontProductMappingCloneService(jdbc), "");
    }

    @Test
    void missingMappingIsRejected() {
        when(jdbc.queryForList(contains("shopfront_store_mapping"), eq("demo")))
                .thenReturn(List.of());
        assertThrows(ResponseStatusException.class, () -> service.purgeLocalWrites());
    }

    @Test
    void queueSyncRequiresCrawlerUrl() {
        assertThrows(ResponseStatusException.class, () -> service.queueDemoSync());
    }
}