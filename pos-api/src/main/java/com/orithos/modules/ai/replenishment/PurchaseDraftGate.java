package com.orithos.modules.ai.replenishment;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/** Mirrors pos-ui purchase-draft-policy: opt-in draft RFQs per store host. */
@Component
public class PurchaseDraftGate {
    private final boolean enabled;
    private final Set<String> allowedHosts;

    public PurchaseDraftGate(
            @Value("${AI_PURCHASE_DRAFT_ENABLED:false}") String enabledFlag,
            @Value("${AI_PURCHASE_DRAFT_ALLOWED_HOSTS:}") String allowedHostsCsv) {
        this.enabled = "true".equalsIgnoreCase(enabledFlag == null ? "" : enabledFlag.trim());
        this.allowedHosts = Arrays.stream((allowedHostsCsv == null ? "" : allowedHostsCsv).split(","))
                .map(String::trim)
                .map(h -> h.toLowerCase(Locale.ROOT).replaceAll("\\.$", ""))
                .filter(h -> !h.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    public boolean draftEnabledForHost(String host) {
        if (!enabled) return false;
        if (host == null || host.isBlank()) return false;
        String normalized = host.trim().toLowerCase(Locale.ROOT).replaceAll("\\.$", "");
        return allowedHosts.contains(normalized);
    }
}