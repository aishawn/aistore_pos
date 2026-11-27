package com.orithos.modules.ai.managerbrief;

import java.time.Instant;
import java.time.LocalDate;

public class AiManagerDailyBriefRow {
    private long id;
    private long vendorId;
    private long outletId;
    private LocalDate businessDate;
    private int revision;
    private String timezone;
    private Instant dataAsOf;
    private String dataQuality;
    private String payloadJson;
    private String modelStatus;
    private Instant createdAt;

    public long getId() { return id; }
    public void setId(long id) { this.id = id; }
    public long getVendorId() { return vendorId; }
    public void setVendorId(long vendorId) { this.vendorId = vendorId; }
    public long getOutletId() { return outletId; }
    public void setOutletId(long outletId) { this.outletId = outletId; }
    public LocalDate getBusinessDate() { return businessDate; }
    public void setBusinessDate(LocalDate businessDate) { this.businessDate = businessDate; }
    public int getRevision() { return revision; }
    public void setRevision(int revision) { this.revision = revision; }
    public String getTimezone() { return timezone; }
    public void setTimezone(String timezone) { this.timezone = timezone; }
    public Instant getDataAsOf() { return dataAsOf; }
    public void setDataAsOf(Instant dataAsOf) { this.dataAsOf = dataAsOf; }
    public String getDataQuality() { return dataQuality; }
    public void setDataQuality(String dataQuality) { this.dataQuality = dataQuality; }
    public String getPayloadJson() { return payloadJson; }
    public void setPayloadJson(String payloadJson) { this.payloadJson = payloadJson; }
    public String getModelStatus() { return modelStatus; }
    public void setModelStatus(String modelStatus) { this.modelStatus = modelStatus; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
