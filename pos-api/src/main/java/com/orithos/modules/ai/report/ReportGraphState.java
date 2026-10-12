package com.orithos.modules.ai.report;

import com.alibaba.cloud.ai.graph.OverAllState;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

final class ReportGraphState {

    private ReportGraphState() {}

    static TenantContext tenant(OverAllState state) {
        long vendor = toLong(state.value("vendor_id").orElse(TenantContext.DEFAULT_VENDOR_ID),
                TenantContext.DEFAULT_VENDOR_ID);
        long user = toLong(state.value("user_id").orElse(0L), 0L);
        Long outlet = toLongOrNull(state.value("outlet_id").orElse(null));
        List<Long> ids = new ArrayList<>();
        Object rawIds = state.value("outlet_ids").orElse(null);
        if (rawIds instanceof List<?> list) {
            for (Object o : list) {
                Long id = toLongOrNull(o);
                if (id != null) {
                    ids.add(id);
                }
            }
        }
        if (outlet != null && !ids.contains(outlet)) {
            ids.add(outlet);
        }
        boolean can = Boolean.TRUE.equals(state.value("can_report_query").orElse(false));
        boolean cost = Boolean.TRUE.equals(state.value("can_report_cost").orElse(false));
        Set<String> auths = new LinkedHashSet<>();
        if (can) {
            auths.add(TenantContext.PERM_QUERY);
        }
        if (cost) {
            auths.add(TenantContext.PERM_COST);
        }
        return new TenantContext(vendor, user, outlet, List.copyOf(ids), Set.copyOf(auths));
    }

    @SuppressWarnings("unchecked")
    static Map<String, String> slots(OverAllState state) {
        Object raw = state.value("slots").orElse(Map.of());
        if (raw instanceof Map<?, ?> m) {
            return (Map<String, String>) m;
        }
        return Map.of();
    }

    static String string(OverAllState state, String key) {
        return state.value(key, String.class).orElse(null);
    }

    static long toLong(Object raw, long fallback) {
        Long v = toLongOrNull(raw);
        return v == null ? fallback : v;
    }

    static Long toLongOrNull(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(raw.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
