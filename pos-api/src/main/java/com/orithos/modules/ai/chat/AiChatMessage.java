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
    private String source;
    private String dataAsOf;
    private String dataSource;
    private String storeScope;
    private String reportPeriodFrom;
    private String reportPeriodTo;
    private String reportTimeZone;
    private String reportDataStatus;
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
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public String getDataAsOf() { return dataAsOf; }
    public void setDataAsOf(String dataAsOf) { this.dataAsOf = dataAsOf; }
    public String getDataSource() { return dataSource; }
    public void setDataSource(String dataSource) { this.dataSource = dataSource; }
    public String getStoreScope() { return storeScope; }
    public void setStoreScope(String storeScope) { this.storeScope = storeScope; }
    public String getReportPeriodFrom() { return reportPeriodFrom; }
    public void setReportPeriodFrom(String reportPeriodFrom) { this.reportPeriodFrom = reportPeriodFrom; }
    public String getReportPeriodTo() { return reportPeriodTo; }
    public void setReportPeriodTo(String reportPeriodTo) { this.reportPeriodTo = reportPeriodTo; }
    public String getReportTimeZone() { return reportTimeZone; }
    public void setReportTimeZone(String reportTimeZone) { this.reportTimeZone = reportTimeZone; }
    public String getReportDataStatus() { return reportDataStatus; }
    public void setReportDataStatus(String reportDataStatus) { this.reportDataStatus = reportDataStatus; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
