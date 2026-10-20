package com.orithos.modules.ai;

import com.orithos.modules.ai.report.TenantContext;

/**
 * Request-scoped tenant for assistant tools. Never accept tenant ids from the model.
 */
public final class AssistantTenantContext {

    private static final ThreadLocal<TenantContext> HOLDER = new ThreadLocal<>();

    private AssistantTenantContext() {}

    public static void set(TenantContext tenant) {
        HOLDER.set(tenant);
    }

    public static TenantContext get() {
        return HOLDER.get();
    }

    public static void clear() {
        HOLDER.remove();
    }
}
