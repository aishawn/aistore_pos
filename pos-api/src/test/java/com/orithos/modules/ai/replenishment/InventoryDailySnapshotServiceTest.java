package com.orithos.modules.ai.replenishment;

import com.orithos.common.BusinessTimezoneService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.TransactionStatus;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class InventoryDailySnapshotServiceTest {
    @Test
    void dailyCaptureStartsNearStoreCloseAndStaysOnTheBusinessDate() {
        assertFalse(InventoryDailySnapshotService.shouldCaptureAt(LocalTime.of(23, 44, 59)));
        assertTrue(InventoryDailySnapshotService.shouldCaptureAt(LocalTime.of(23, 45)));
        assertTrue(InventoryDailySnapshotService.shouldCaptureAt(LocalTime.of(23, 59, 59)));
        assertFalse(InventoryDailySnapshotService.shouldCaptureAt(LocalTime.MIDNIGHT));
    }

    @Test
    @SuppressWarnings("unchecked")
    void duplicateDailyCaptureRunsInsideTransactionAndDoesNotWriteAgain() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        BusinessTimezoneService timezone = mock(BusinessTimezoneService.class);
        TransactionTemplate transactions = mock(TransactionTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq(7L))).thenReturn(2);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenReturn(List.of());
        when(transactions.execute(any(TransactionCallback.class))).thenAnswer(invocation -> {
            TransactionCallback<Boolean> callback = invocation.getArgument(0);
            return callback.doInTransaction(mock(TransactionStatus.class));
        });

        var service = new InventoryDailySnapshotService(jdbc, timezone, transactions);

        assertFalse(service.captureOutlet(7L, LocalDate.of(2026, 11, 25)));
        verify(transactions).execute(any(TransactionCallback.class));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
}
