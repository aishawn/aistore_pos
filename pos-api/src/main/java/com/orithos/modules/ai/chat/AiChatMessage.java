package com.orithos.modules.ai.chat;

import java.time.LocalDateTime;

public class AiChatMessage {
    private Long id;
    private Long threadId;
    private String role;
    private String textContent;
    private String intent;
    private Long reportId;
    private String slotsJson;
    private LocalDateTime createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getThreadId() { return threadId; }
    public void setThreadId(Long threadId) { this.threadId = threadId; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public String getTextContent() { return textContent; }
    public void setTextContent(String textContent) { this.textContent = textContent; }
    public String getIntent() { return intent; }
    public void setIntent(String intent) { this.intent = intent; }
    public Long getReportId() { return reportId; }
    public void setReportId(Long reportId) { this.reportId = reportId; }
    public String getSlotsJson() { return slotsJson; }
    public void setSlotsJson(String slotsJson) { this.slotsJson = slotsJson; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
