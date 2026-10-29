package com.orithos.modules.ai.gateway;

/**
 * Runtime scope for an AI call. Values are created from SecurityContext by the
 * caller; model output must never be allowed to populate this record.
 */
public record AiTenantContext(long vendorId, long outletId, long userId, String correlationId) {
    public AiTenantContext {
        if (vendorId <= 0 || outletId <= 0 || userId <= 0) {
            throw new IllegalArgumentException("AI tenant scope is required");
        }
        correlationId = correlationId == null || correlationId.isBlank() ? "unknown" : correlationId;
    }
}
