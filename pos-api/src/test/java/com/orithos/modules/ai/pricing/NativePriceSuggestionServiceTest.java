package com.orithos.modules.ai.pricing;

import com.orithos.common.BusinessTimezoneService;
import com.orithos.modules.ai.report.TenantContext;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.time.ZoneId;
import java.util.List;
import java.util.Set;

import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NativePriceSuggestionServiceTest {

    @Test
    void bindsOutletBeforeTimezoneForTheSalesQuery() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        BusinessTimezoneService timezone = mock(BusinessTimezoneService.class);
        when(timezone.zoneForVendor(1L)).thenReturn(ZoneId.of("Australia/Melbourne"));
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenReturn(List.of());
        NativePriceSuggestionService service = new NativePriceSuggestionService(jdbc, timezone);
        TenantContext tenant = new TenantContext(1L, 1L, 87L, List.of(87L), Set.of("ROLE_ADMIN"));

        service.review(tenant);

        ArgumentCaptor<Object[]> arguments = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).query(anyString(), any(RowMapper.class), arguments.capture());
        assertArrayEquals(new Object[]{87L, "Australia/Melbourne", 87L}, arguments.getValue());
    }
}
