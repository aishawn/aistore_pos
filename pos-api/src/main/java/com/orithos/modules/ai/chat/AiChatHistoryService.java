package com.orithos.modules.ai.chat;

import com.orithos.common.BusinessException;
import com.orithos.modules.ai.AiConversationMemory;
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

    public AiChatHistoryService(AiChatHistoryMapper mapper,
                                ObjectProvider<AiConversationMemory> conversationMemory) {
        this.mapper = mapper;
        this.conversationMemory = conversationMemory;
    }

    public void appendTurn(TenantContext tenant, String sessionKey, String question,
                           String intent, String answer) {
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

            if (answer != null && !answer.isBlank()) {
                AiChatMessage assistantMsg = new AiChatMessage();
                assistantMsg.setThreadId(thread.getId());
                assistantMsg.setRole("assistant");
                assistantMsg.setTextContent(answer.trim());
                assistantMsg.setIntent(intent);
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
            row.put("id", t.getId());
            row.put("sessionKey", t.getSessionKey());
            row.put("title", t.getTitle() == null || t.getTitle().isBlank() ? "Chat" : t.getTitle());
            row.put("updatedAt", t.getUpdatedAt());
            row.put("createdAt", t.getCreatedAt());
            out.add(row);
        }
        return out;
    }

    public Map<String, Object> getThread(TenantContext tenant, long id) {
        AiChatThread thread = mapper.findOwned(id, tenant.vendorId(), tenant.userId());
        if (thread == null) {
            throw new BusinessException(40410, "Chat thread not found");
        }
        List<AiChatMessage> messages = mapper.listMessages(thread.getId(), MAX_MESSAGES);
        List<Map<String, Object>> msgOut = new ArrayList<>();
        for (AiChatMessage m : messages) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", m.getId());
            row.put("role", m.getRole());
            row.put("text", m.getTextContent());
            row.put("intent", m.getIntent());
            row.put("createdAt", m.getCreatedAt());
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
                        message.getTextContent() == null ? "" : message.getTextContent()));
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

    private static String titleFrom(String question) {
        String t = question.trim().replaceAll("\\s+", " ");
        if (t.length() <= TITLE_MAX) return t;
        return t.substring(0, TITLE_MAX - 1) + "…";
    }
}
