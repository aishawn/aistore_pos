package com.orithos.modules.ai.chat;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.modules.ai.AiConversationMemory;
import com.orithos.modules.ai.PosAssistantGraphService;
import com.orithos.modules.ai.report.AiReportSnapshotService;
import com.orithos.modules.ai.report.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AiChatHistoryService {

    private static final Logger log = LoggerFactory.getLogger(AiChatHistoryService.class);
    private static final int MAX_THREADS = 40;
    private static final int MAX_MESSAGES = 200;
    private static final int REHYDRATE_TURNS = 12;
    private static final int TITLE_MAX = 80;

    private final AiChatHistoryMapper mapper;
    private final ObjectProvider<AiConversationMemory> conversationMemory;
    private final AiReportSnapshotService reportSnapshotService;
    private final ObjectMapper objectMapper;

    public AiChatHistoryService(AiChatHistoryMapper mapper,
                                ObjectProvider<AiConversationMemory> conversationMemory,
                                AiReportSnapshotService reportSnapshotService,
                                ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.conversationMemory = conversationMemory;
        this.reportSnapshotService = reportSnapshotService;
        this.objectMapper = objectMapper;
    }

    public void appendTurn(TenantContext tenant, String sessionKey, String question,
                           String intent, String answer) {
        appendTurn(tenant, sessionKey, question, intent, answer, null, Map.of());
    }

    public void appendTurn(TenantContext tenant, String sessionKey, String question,
                           String intent, String answer, Long reportId) {
        appendTurn(tenant, sessionKey, question, intent, answer, reportId, Map.of());
    }

    public void appendTurn(TenantContext tenant, String sessionKey, String question,
                           String intent, String answer, Long reportId, Map<String, String> slots) {
        appendTurn(tenant, sessionKey, question, intent, answer, reportId, slots,
                null, null, null, null, null, null, null, null);
    }

    public void appendTurn(TenantContext tenant, String sessionKey, String question,
                           String intent, String answer, Long reportId, Map<String, String> slots,
                           String source, String dataAsOf, String dataSource, String storeScope,
                           String reportPeriodFrom, String reportPeriodTo,
                           String reportTimeZone, String reportDataStatus) {
        if (tenant == null || sessionKey == null || sessionKey.isBlank()
                || question == null || question.isBlank()) {
            return;
        }
        try {
            AiChatThread thread = mapper.findBySessionKey(sessionKey.trim());
            if (thread == null) {
                thread = new AiChatThread();
                thread.setVendorId(tenant.vendorId());
                thread.setUserId(tenant.userId());
                thread.setSessionKey(sessionKey.trim());
                thread.setTitle(titleFrom(question));
                mapper.insertThread(thread);
            } else if (thread.getVendorId() != tenant.vendorId() || thread.getUserId() != tenant.userId()) {
                log.warn("AI chat thread session_key ownership mismatch; skip persist");
                return;
            } else {
                mapper.touchThread(thread.getId(), thread.getTitle() == null || thread.getTitle().isBlank()
                        ? titleFrom(question) : null);
            }

            AiChatMessage userMsg = new AiChatMessage();
            userMsg.setThreadId(thread.getId());
            userMsg.setRole("user");
            userMsg.setTextContent(question.trim());
            userMsg.setIntent(null);
            mapper.insertMessage(userMsg);

            if ((answer != null && !answer.isBlank()) || reportId != null
                    || (slots != null && !slots.isEmpty()) || source != null || dataAsOf != null
                    || dataSource != null || storeScope != null || reportPeriodFrom != null
                    || reportPeriodTo != null || reportTimeZone != null || reportDataStatus != null) {
                AiChatMessage assistantMsg = new AiChatMessage();
                assistantMsg.setThreadId(thread.getId());
                assistantMsg.setRole("assistant");
                assistantMsg.setTextContent(answer == null ? "" : answer.trim());
                assistantMsg.setIntent(intent);
                assistantMsg.setReportId(reportId);
                assistantMsg.setSlotsJson(serializeSlots(slots));
                assistantMsg.setSource(source);
                assistantMsg.setDataAsOf(dataAsOf);
                assistantMsg.setDataSource(dataSource);
                assistantMsg.setStoreScope(storeScope);
                assistantMsg.setReportPeriodFrom(reportPeriodFrom);
                assistantMsg.setReportPeriodTo(reportPeriodTo);
                assistantMsg.setReportTimeZone(reportTimeZone);
                assistantMsg.setReportDataStatus(reportDataStatus);
                mapper.insertMessage(assistantMsg);
            }
        } catch (DataAccessException e) {
            log.warn("AI chat history persist skipped type={}", e.getClass().getSimpleName());
        } catch (Exception e) {
            log.warn("AI chat history persist skipped type={}", e.getClass().getSimpleName());
        }
    }

    public List<Map<String, Object>> listThreads(TenantContext tenant) {
        List<AiChatThread> threads = mapper.listThreads(tenant.vendorId(), tenant.userId(), MAX_THREADS);
        List<Map<String, Object>> out = new ArrayList<>();
        for (AiChatThread t : threads) {
            Map<String, Object> row = new LinkedHashMap<>();
            // Older deployments may deserialize the numeric identity as null;
            // sessionKey is still unique and is accepted by the detail route.
            row.put("id", t.getId() != null ? t.getId() : t.getSessionKey());
            row.put("sessionKey", t.getSessionKey());
            row.put("title", t.getTitle() == null || t.getTitle().isBlank() ? "Chat" : t.getTitle());
            row.put("updatedAt", t.getUpdatedAt());
            row.put("createdAt", t.getCreatedAt());
            out.add(row);
        }
        return out;
    }

    public Map<String, Object> getThread(TenantContext tenant, String identifier) {
        AiChatThread thread;
        Long numericId = null;
        try {
            numericId = Long.valueOf(identifier);
        } catch (NumberFormatException ignored) {
            // Session-key identifiers are used for compatibility with older rows.
        }
        thread = numericId != null
                ? mapper.findOwned(numericId, tenant.vendorId(), tenant.userId())
                : mapper.findOwnedBySessionKey(identifier, tenant.vendorId(), tenant.userId());
        if (thread == null) {
            throw new BusinessException(40410, "Chat thread not found");
        }
        List<AiChatMessage> messages = thread.getId() != null
                ? mapper.listMessages(thread.getId(), MAX_MESSAGES)
                : mapper.listMessagesBySessionKey(thread.getSessionKey(), tenant.vendorId(), tenant.userId(),
                        MAX_MESSAGES);
        List<Map<String, Object>> msgOut = new ArrayList<>();
        String pendingQuestion = null;
        for (AiChatMessage m : messages) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", m.getId());
            row.put("role", m.getRole());
            row.put("text", m.getTextContent());
            row.put("intent", m.getIntent());
            row.put("createdAt", m.getCreatedAt());
            row.put("source", m.getSource());
            row.put("dataAsOf", m.getDataAsOf());
            row.put("dataSource", m.getDataSource());
            row.put("storeScope", m.getStoreScope());
            row.put("reportPeriodFrom", m.getReportPeriodFrom());
            row.put("reportPeriodTo", m.getReportPeriodTo());
            row.put("reportTimeZone", m.getReportTimeZone());
            row.put("reportDataStatus", m.getReportDataStatus());
            if ("assistant".equalsIgnoreCase(m.getRole()) && m.getReportId() != null) {
                try {
                    var report = reportSnapshotService.getOwned(m.getReportId(), tenant);
                    row.put("reportId", report.id());
                    row.put("table", report.table());
                } catch (BusinessException e) {
                    log.warn("AI chat report snapshot restore skipped id={} code={}", m.getReportId(), e.getCode());
                } catch (DataAccessException e) {
                    log.warn("AI chat report snapshot restore skipped id={} type={}",
                            m.getReportId(), e.getClass().getSimpleName());
                }
            }
            if ("user".equalsIgnoreCase(m.getRole())) {
                pendingQuestion = m.getTextContent();
            } else if ("assistant".equalsIgnoreCase(m.getRole()) && pendingQuestion != null) {
                List<?> cards = PosAssistantGraphService.cardsForHistory(
                        m.getIntent(), m.getTextContent(), pendingQuestion);
                if (!cards.isEmpty()) row.put("cards", cards);
                pendingQuestion = null;
            }
            msgOut.add(row);
        }
        rehydrateActiveContext(thread.getSessionKey(), messages);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", thread.getId());
        body.put("sessionKey", thread.getSessionKey());
        body.put("title", thread.getTitle());
        body.put("updatedAt", thread.getUpdatedAt());
        body.put("messages", msgOut);
        return body;
    }

    public Map<String, Object> getThread(TenantContext tenant, long id) {
        return getThread(tenant, Long.toString(id));
    }

    /**
     * Rebuild Redis short-term memory from durable history so follow-ups work
     * after the Redis TTL expires.
     */
    private void rehydrateActiveContext(String sessionKey, List<AiChatMessage> messages) {
        AiConversationMemory memory = conversationMemory.getIfAvailable();
        if (memory == null || sessionKey == null || sessionKey.isBlank()
                || messages == null || messages.isEmpty()) {
            return;
        }
        List<AiConversationMemory.Turn> turns = new ArrayList<>();
        String pendingQuestion = null;
        for (AiChatMessage message : messages) {
            if (message == null || message.getRole() == null) {
                continue;
            }
            if ("user".equalsIgnoreCase(message.getRole())) {
                pendingQuestion = message.getTextContent();
            } else if ("assistant".equalsIgnoreCase(message.getRole()) && pendingQuestion != null) {
                turns.add(new AiConversationMemory.Turn(
                        pendingQuestion,
                        message.getIntent() == null ? "" : message.getIntent(),
                        message.getTextContent() == null ? "" : message.getTextContent(),
                        deserializeSlots(message.getSlotsJson())));
                pendingQuestion = null;
            }
        }
        if (turns.isEmpty()) {
            return;
        }
        if (turns.size() > REHYDRATE_TURNS) {
            turns = turns.subList(turns.size() - REHYDRATE_TURNS, turns.size());
        }
        memory.rehydrate(sessionKey, turns);
    }

    private String serializeSlots(Map<String, String> slots) {
        try {
            return objectMapper.writeValueAsString(slots == null ? Map.of() : slots);
        } catch (Exception e) {
            log.warn("AI chat slots persist skipped type={}", e.getClass().getSimpleName());
            return null;
        }
    }

    private Map<String, String> deserializeSlots(String slotsJson) {
        if (slotsJson == null || slotsJson.isBlank()) return Map.of();
        try {
            Map<String, String> slots = objectMapper.readValue(slotsJson, new TypeReference<>() {});
            if (slots == null || slots.isEmpty()) return Map.of();
            Map<String, String> clean = new LinkedHashMap<>();
            slots.forEach((key, value) -> {
                if (key != null && value != null && !key.isBlank()) clean.put(key, value);
            });
            return clean;
        } catch (Exception e) {
            log.warn("AI chat slots restore skipped type={}", e.getClass().getSimpleName());
            return Map.of();
        }
    }

    private static String titleFrom(String question) {
        String t = question.trim().replaceAll("\\s+", " ");
        if (t.length() <= TITLE_MAX) return t;
        return t.substring(0, TITLE_MAX - 1) + "…";
    }
}
