package com.orithos.modules.ai.chat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.modules.ai.AiConversationMemory;
import com.orithos.modules.ai.dto.AssistantCard;
import com.orithos.modules.ai.dto.AiReportSnapshotResponse;
import com.orithos.modules.ai.dto.ReportTable;
import com.orithos.modules.ai.report.AiReportSnapshotService;
import com.orithos.modules.ai.report.TenantContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.mockito.ArgumentCaptor;

class AiChatHistoryServiceTest {

    @Test
    void sessionKeyHistoryLookupIsScopedToTheCurrentOwner() {
        AiChatHistoryMapper mapper = mock(AiChatHistoryMapper.class);
        ObjectProvider<AiConversationMemory> memory = mock(ObjectProvider.class);
        when(memory.getIfAvailable()).thenReturn(null);
        AiReportSnapshotService snapshots = mock(AiReportSnapshotService.class);
        TenantContext tenant = tenant();
        when(mapper.findBySessionKey("secret-session"))
                .thenReturn(thread(99L, "secret-session"));

        AiChatHistoryService service = service(mapper, memory, snapshots);

        assertThrows(BusinessException.class, () -> service.getThread(tenant, "secret-session"));
        verify(mapper).findOwnedBySessionKey("secret-session", tenant.vendorId(), tenant.userId());
        verify(mapper, never()).listMessagesBySessionKey("secret-session",
                tenant.vendorId(), tenant.userId(), 200);
    }

    @Test
    void persistsReportSnapshotIdOnTheAssistantMessage() {
        AiChatHistoryMapper mapper = mock(AiChatHistoryMapper.class);
        ObjectProvider<AiConversationMemory> memory = mock(ObjectProvider.class);
        AiReportSnapshotService snapshots = mock(AiReportSnapshotService.class);
        TenantContext tenant = tenant();
        AiChatThread thread = thread(21L, "session-a");
        when(mapper.findBySessionKey("session-a")).thenReturn(thread);

        AiChatHistoryService service = service(mapper, memory, snapshots);
        service.appendTurn(tenant, "session-a", "Today's sales", "report_sales", "$1,240", 91L);

        ArgumentCaptor<AiChatMessage> captor = ArgumentCaptor.forClass(AiChatMessage.class);
        verify(mapper, times(2)).insertMessage(captor.capture());
        AiChatMessage assistant = captor.getAllValues().get(1);
        assertEquals("assistant", assistant.getRole());
        assertEquals(Long.valueOf(91L), assistant.getReportId());
    }

    @Test
    void persistsReportSnapshotEvenWhenTheTextAnswerIsBlank() {
        AiChatHistoryMapper mapper = mock(AiChatHistoryMapper.class);
        ObjectProvider<AiConversationMemory> memory = mock(ObjectProvider.class);
        AiReportSnapshotService snapshots = mock(AiReportSnapshotService.class);
        TenantContext tenant = tenant();
        when(mapper.findBySessionKey("session-a")).thenReturn(thread(21L, "session-a"));

        AiChatHistoryService service = service(mapper, memory, snapshots);
        service.appendTurn(tenant, "session-a", "Today's sales", "report_sales", "  ", 91L);

        ArgumentCaptor<AiChatMessage> captor = ArgumentCaptor.forClass(AiChatMessage.class);
        verify(mapper, times(2)).insertMessage(captor.capture());
        AiChatMessage assistant = captor.getAllValues().get(1);
        assertEquals("", assistant.getTextContent());
        assertEquals(Long.valueOf(91L), assistant.getReportId());
    }

    @Test
    void restoresOnlyTheOwnedReportSnapshotIntoHistoricalMessages() {
        AiChatHistoryMapper mapper = mock(AiChatHistoryMapper.class);
        ObjectProvider<AiConversationMemory> memory = mock(ObjectProvider.class);
        when(memory.getIfAvailable()).thenReturn(null);
        AiReportSnapshotService snapshots = mock(AiReportSnapshotService.class);
        TenantContext tenant = tenant();
        AiChatThread thread = thread(21L, "session-a");
        AiChatMessage user = message(1L, "user", "Today's sales", null, null);
        AiChatMessage assistant = message(2L, "assistant", "$1,240", "report_sales", 91L);
        ReportTable table = new ReportTable(List.of("Total sales"), List.of(Map.of("Total sales", 1240)));
        when(mapper.findOwned(21L, tenant.vendorId(), tenant.userId())).thenReturn(thread);
        when(mapper.listMessages(21L, 200)).thenReturn(List.of(user, assistant));
        when(snapshots.getOwned(91L, tenant)).thenReturn(new AiReportSnapshotResponse(
                91L, "report_sales", "Today's sales", "Sales today", table, Map.of(), null));

        AiChatHistoryService service = service(mapper, memory, snapshots);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> messages = (List<Map<String, Object>>) service.getThread(tenant, 21L).get("messages");
        Map<String, Object> restoredAssistant = messages.get(1);

        verify(snapshots).getOwned(91L, tenant);
        assertEquals(91L, restoredAssistant.get("reportId"));
        assertEquals(table, restoredAssistant.get("table"));
    }

    @Test
    void restoresHistoricalStockUnavailableCardAfterReopeningThread() {
        AiChatHistoryMapper mapper = mock(AiChatHistoryMapper.class);
        ObjectProvider<AiConversationMemory> memory = mock(ObjectProvider.class);
        when(memory.getIfAvailable()).thenReturn(null);
        AiReportSnapshotService snapshots = mock(AiReportSnapshotService.class);
        TenantContext tenant = tenant();
        AiChatThread thread = thread(21L, "session-a");
        AiChatMessage user = message(1L, "user", "How much Shiraz was in stock yesterday?", null, null);
        AiChatMessage assistant = message(2L, "assistant",
                "Stock reports show a live snapshot; historical stock is unavailable. Open the stock page to view current stock.",
                "stock_history_unavailable", null);
        when(mapper.findOwned(21L, tenant.vendorId(), tenant.userId())).thenReturn(thread);
        when(mapper.listMessages(21L, 200)).thenReturn(List.of(user, assistant));

        AiChatHistoryService service = service(mapper, memory, snapshots);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> messages = (List<Map<String, Object>>) service.getThread(tenant, 21L).get("messages");
        @SuppressWarnings("unchecked")
        List<AssistantCard> cards = (List<AssistantCard>) messages.get(1).get("cards");

        assertEquals(1, cards.size());
        assertEquals("stock_history", cards.getFirst().type());
        assertEquals("unavailable", cards.getFirst().status());
        assertEquals("/stock/list", cards.getFirst().ctaRoute());
        assertEquals(false, cards.getFirst().retryable());
    }

    @Test
    void keepsHistoryReadableWhenItsReportSnapshotIsMissing() {
        AiChatHistoryMapper mapper = mock(AiChatHistoryMapper.class);
        ObjectProvider<AiConversationMemory> memory = mock(ObjectProvider.class);
        when(memory.getIfAvailable()).thenReturn(null);
        AiReportSnapshotService snapshots = mock(AiReportSnapshotService.class);
        TenantContext tenant = tenant();
        AiChatThread thread = thread(21L, "session-a");
        AiChatMessage assistant = message(2L, "assistant", "Sales were $1,240.", "report_sales", 91L);
        when(mapper.findOwned(21L, tenant.vendorId(), tenant.userId())).thenReturn(thread);
        when(mapper.listMessages(21L, 200)).thenReturn(List.of(assistant));
        when(snapshots.getOwned(91L, tenant)).thenThrow(new BusinessException(40401, "Report not found"));

        AiChatHistoryService service = service(mapper, memory, snapshots);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> messages = (List<Map<String, Object>>) service.getThread(tenant, 21L).get("messages");

        assertEquals("Sales were $1,240.", messages.getFirst().get("text"));
        assertFalse(messages.getFirst().containsKey("reportId"));
        assertFalse(messages.getFirst().containsKey("table"));
    }

    @Test
    void opensLegacyThreadBySessionKeyWhenNumericIdCannotBeMapped() {
        AiChatHistoryMapper mapper = mock(AiChatHistoryMapper.class);
        ObjectProvider<AiConversationMemory> memory = mock(ObjectProvider.class);
        when(memory.getIfAvailable()).thenReturn(null);
        AiReportSnapshotService snapshots = mock(AiReportSnapshotService.class);
        TenantContext tenant = tenant();
        AiChatThread legacyThread = thread(0L, "legacy-session-key");
        legacyThread.setId(null);
        AiChatMessage user = message(1L, "user", "Check today's sales", null, null);
        when(mapper.findOwnedBySessionKey("legacy-session-key", tenant.vendorId(), tenant.userId()))
                .thenReturn(legacyThread);
        when(mapper.listMessagesBySessionKey("legacy-session-key", tenant.vendorId(), tenant.userId(), 200))
                .thenReturn(List.of(user));

        Map<String, Object> detail = service(mapper, memory, snapshots)
                .getThread(tenant, "legacy-session-key");

        assertEquals("legacy-session-key", detail.get("sessionKey"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> messages = (List<Map<String, Object>>) detail.get("messages");
        assertEquals("Check today's sales", messages.getFirst().get("text"));
        verify(mapper).listMessagesBySessionKey("legacy-session-key", tenant.vendorId(), tenant.userId(), 200);
    }

    @Test
    void persistsSlotsWithAssistantHistoryForLaterRecovery() {
        AiChatHistoryMapper mapper = mock(AiChatHistoryMapper.class);
        ObjectProvider<AiConversationMemory> memory = mock(ObjectProvider.class);
        AiReportSnapshotService snapshots = mock(AiReportSnapshotService.class);
        when(mapper.findBySessionKey("session-a")).thenReturn(thread(21L, "session-a"));

        service(mapper, memory, snapshots).appendTurn(tenant(), "session-a",
                "How much Shiraz is in stock?", "report_stock", "Shiraz: 4", null,
                Map.of("query", "Shiraz", "category", "wine", "days", "7"));

        ArgumentCaptor<AiChatMessage> captor = ArgumentCaptor.forClass(AiChatMessage.class);
        verify(mapper, times(2)).insertMessage(captor.capture());
        try {
            assertEquals(Map.of("query", "Shiraz", "category", "wine", "days", "7"),
                    new ObjectMapper().readValue(captor.getAllValues().get(1).getSlotsJson(),
                            new com.fasterxml.jackson.core.type.TypeReference<Map<String, String>>() {}));
        } catch (Exception e) {
            throw new AssertionError(e);
        }
    }

    @Test
    void persistsAndRestoresReportProvenanceWithTheAssistantMessage() {
        AiChatHistoryMapper mapper = mock(AiChatHistoryMapper.class);
        ObjectProvider<AiConversationMemory> memory = mock(ObjectProvider.class);
        when(memory.getIfAvailable()).thenReturn(null);
        AiReportSnapshotService snapshots = mock(AiReportSnapshotService.class);
        TenantContext tenant = tenant();
        AiChatThread thread = thread(21L, "session-a");
        when(mapper.findBySessionKey("session-a")).thenReturn(thread);
        AiChatHistoryService service = service(mapper, memory, snapshots);

        service.appendTurn(tenant, "session-a", "Yesterday sales?", "report_sales", "$1,240", null,
                Map.of("from", "2026-11-11", "to", "2026-11-11"), "deterministic",
                "2026-11-12T01:00:00Z", "Orithos native sales ledger", "outlet:3",
                "2026-11-11", "2026-11-11", "Australia/Adelaide", "AVAILABLE");

        ArgumentCaptor<AiChatMessage> captor = ArgumentCaptor.forClass(AiChatMessage.class);
        verify(mapper, times(2)).insertMessage(captor.capture());
        AiChatMessage persisted = captor.getAllValues().get(1);
        assertEquals("Orithos native sales ledger", persisted.getDataSource());
        assertEquals("deterministic", persisted.getSource());
        assertEquals("2026-11-12T01:00:00Z", persisted.getDataAsOf());
        assertEquals("outlet:3", persisted.getStoreScope());
        assertEquals("2026-11-11", persisted.getReportPeriodFrom());
        assertEquals("2026-11-11", persisted.getReportPeriodTo());
        assertEquals("Australia/Adelaide", persisted.getReportTimeZone());
        assertEquals("AVAILABLE", persisted.getReportDataStatus());

        AiChatMessage user = message(1L, "user", "Yesterday sales?", null, null);
        when(mapper.findOwned(21L, tenant.vendorId(), tenant.userId())).thenReturn(thread);
        when(mapper.listMessages(21L, 200)).thenReturn(List.of(user, persisted));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> restored = (List<Map<String, Object>>) service.getThread(tenant, 21L).get("messages");
        assertEquals("Orithos native sales ledger", restored.get(1).get("dataSource"));
        assertEquals("deterministic", restored.get(1).get("source"));
        assertEquals("2026-11-12T01:00:00Z", restored.get(1).get("dataAsOf"));
        assertEquals("2026-11-11", restored.get(1).get("reportPeriodFrom"));
        assertEquals("2026-11-11", restored.get(1).get("reportPeriodTo"));
        assertEquals("Australia/Adelaide", restored.get(1).get("reportTimeZone"));
        assertEquals("AVAILABLE", restored.get(1).get("reportDataStatus"));
    }

    @Test
    void historyRestoreRehydratesTheStoredSlots() {
        AiChatHistoryMapper mapper = mock(AiChatHistoryMapper.class);
        ObjectProvider<AiConversationMemory> memoryProvider = mock(ObjectProvider.class);
        AiConversationMemory memory = mock(AiConversationMemory.class);
        when(memoryProvider.getIfAvailable()).thenReturn(memory);
        AiReportSnapshotService snapshots = mock(AiReportSnapshotService.class);
        TenantContext tenant = tenant();
        AiChatThread thread = thread(21L, "session-a");
        AiChatMessage user = message(1L, "user", "How much Shiraz is in stock?", null, null);
        AiChatMessage assistant = message(2L, "assistant", "Shiraz: 4", "report_stock", null);
        assistant.setSlotsJson("{\"query\":\"Shiraz\",\"category\":\"wine\",\"days\":\"7\"}");
        when(mapper.findOwned(21L, tenant.vendorId(), tenant.userId())).thenReturn(thread);
        when(mapper.listMessages(21L, 200)).thenReturn(List.of(user, assistant));

        service(mapper, memoryProvider, snapshots).getThread(tenant, 21L);

        ArgumentCaptor<List<AiConversationMemory.Turn>> captor = ArgumentCaptor.forClass(List.class);
        verify(memory).rehydrate(org.mockito.ArgumentMatchers.eq("session-a"), captor.capture());
        assertEquals(Map.of("query", "Shiraz", "category", "wine", "days", "7"),
                captor.getValue().getFirst().slots());
    }

    @Test
    void historyRestoreTreatsLegacyAndMalformedSlotsAsEmpty() {
        AiChatHistoryMapper mapper = mock(AiChatHistoryMapper.class);
        ObjectProvider<AiConversationMemory> memoryProvider = mock(ObjectProvider.class);
        AiConversationMemory memory = mock(AiConversationMemory.class);
        when(memoryProvider.getIfAvailable()).thenReturn(memory);
        AiReportSnapshotService snapshots = mock(AiReportSnapshotService.class);
        TenantContext tenant = tenant();
        AiChatThread thread = thread(21L, "session-a");
        AiChatMessage oldUser = message(1L, "user", "Yesterday's sales?", null, null);
        AiChatMessage oldAssistant = message(2L, "assistant", "Sales were $1,240.", "report_sales", null);
        AiChatMessage malformedUser = message(3L, "user", "And the day before?", null, null);
        AiChatMessage malformedAssistant = message(4L, "assistant", "I could not retrieve that report.",
                "report_sales", null);
        malformedAssistant.setSlotsJson("not-json");
        AiChatMessage nullValueUser = message(5L, "user", "And another day?", null, null);
        AiChatMessage nullValueAssistant = message(6L, "assistant", "No report data.", "report_sales", null);
        nullValueAssistant.setSlotsJson("{\"query\":null}");
        when(mapper.findOwned(21L, tenant.vendorId(), tenant.userId())).thenReturn(thread);
        when(mapper.listMessages(21L, 200)).thenReturn(List.of(
                oldUser, oldAssistant, malformedUser, malformedAssistant, nullValueUser, nullValueAssistant));

        service(mapper, memoryProvider, snapshots).getThread(tenant, 21L);

        ArgumentCaptor<List<AiConversationMemory.Turn>> captor = ArgumentCaptor.forClass(List.class);
        verify(memory).rehydrate(org.mockito.ArgumentMatchers.eq("session-a"), captor.capture());
        assertEquals(3, captor.getValue().size());
        assertEquals(Map.of(), captor.getValue().get(0).slots());
        assertEquals(Map.of(), captor.getValue().get(1).slots());
        assertEquals(Map.of(), captor.getValue().get(2).slots());
    }

    private static TenantContext tenant() {
        return new TenantContext(7L, 9L, 3L, List.of(3L), Set.of("ROLE_ADMIN"));
    }

    private static AiChatHistoryService service(AiChatHistoryMapper mapper,
                                               ObjectProvider<AiConversationMemory> memory,
                                               AiReportSnapshotService snapshots) {
        return new AiChatHistoryService(mapper, memory, snapshots, new ObjectMapper());
    }

    private static AiChatThread thread(long id, String sessionKey) {
        AiChatThread thread = new AiChatThread();
        thread.setId(id);
        thread.setVendorId(7L);
        thread.setUserId(9L);
        thread.setSessionKey(sessionKey);
        return thread;
    }

    private static AiChatMessage message(long id, String role, String text, String intent, Long reportId) {
        AiChatMessage message = new AiChatMessage();
        message.setId(id);
        message.setRole(role);
        message.setTextContent(text);
        message.setIntent(intent);
        message.setReportId(reportId);
        return message;
    }
}
