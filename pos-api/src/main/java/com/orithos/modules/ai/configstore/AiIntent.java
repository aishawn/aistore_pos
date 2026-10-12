package com.orithos.modules.ai.configstore;

import java.time.LocalDateTime;

/** Whitelisted AI intent definition. */
public class AiIntent {
    private Long id;
    private String code;
    private String name;
    private String description;
    private String promptHint;
    private String defaultPanel;
    private String defaultView;
    private Boolean enabled;
    private Integer sortOrder;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getPromptHint() { return promptHint; }
    public void setPromptHint(String promptHint) { this.promptHint = promptHint; }
    public String getDefaultPanel() { return defaultPanel; }
    public void setDefaultPanel(String defaultPanel) { this.defaultPanel = defaultPanel; }
    public String getDefaultView() { return defaultView; }
    public void setDefaultView(String defaultView) { this.defaultView = defaultView; }
    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
