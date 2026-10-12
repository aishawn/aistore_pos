package com.orithos.modules.ai.configstore;

import java.time.LocalDateTime;

/** Allowed value for an enum slot (route / view / panel / action). */
public class AiSlotValue {
    private Long id;
    private String slotCode;
    private String valueKey;
    private String value;
    private String label;
    private Boolean enabled;
    private Integer sortOrder;
    private LocalDateTime createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getSlotCode() { return slotCode; }
    public void setSlotCode(String slotCode) { this.slotCode = slotCode; }
    public String getValueKey() { return valueKey; }
    public void setValueKey(String valueKey) { this.valueKey = valueKey; }
    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
