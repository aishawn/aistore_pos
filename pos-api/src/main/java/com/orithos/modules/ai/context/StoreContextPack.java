package com.orithos.modules.ai.context;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Server-assembled store framing for classify/respond. Never accept vendor/outlet
 * from the model — pack fields come from JWT and vendor metadata only.
 */
public record StoreContextPack(
        long vendorId,
        Long outletId,
        String storeName,
        String subdomain,
        String businessTimezone,
        boolean canQueryReport,
        boolean canQueryCost,
        String lastIntent,
        Map<String, String> lastSlots,
        List<String> lexiconHints,
        String surface
) {
    public StoreContextPack {
        lastSlots = lastSlots == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(lastSlots));
        lexiconHints = lexiconHints == null ? List.of() : List.copyOf(lexiconHints);
        storeName = storeName == null ? "" : storeName;
        subdomain = subdomain == null ? "" : subdomain;
        businessTimezone = businessTimezone == null ? "" : businessTimezone;
        lastIntent = lastIntent == null ? "" : lastIntent;
        surface = surface == null ? "" : surface;
    }

    /** Compact prompt block — keep token use small for classify. */
    public String promptSummary() {
        StringBuilder sb = new StringBuilder();
        sb.append("Store context (trusted server data; do not invent tenant ids):\n");
        if (!storeName.isBlank()) {
            sb.append("- Store: ").append(storeName);
            if (!subdomain.isBlank()) {
                sb.append(" (").append(subdomain).append(')');
            }
            sb.append('\n');
        } else if (!subdomain.isBlank()) {
            sb.append("- Store subdomain: ").append(subdomain).append('\n');
        }
        if (outletId != null) {
            sb.append("- Outlet id: ").append(outletId).append('\n');
        }
        if (!businessTimezone.isBlank()) {
            sb.append("- Business timezone: ").append(businessTimezone).append('\n');
        }
        sb.append("- Report permission: ").append(canQueryReport ? "yes" : "no").append('\n');
        sb.append("- Cost permission: ").append(canQueryCost ? "yes" : "no").append('\n');
        if (!surface.isBlank()) {
            sb.append("- UI surface: ").append(surface).append('\n');
        }
        if (!lastIntent.isBlank()) {
            sb.append("- Previous intent: ").append(lastIntent);
            if (!lastSlots.isEmpty()) {
                sb.append(" slots=").append(lastSlots);
            }
            sb.append('\n');
        }
        if (!lexiconHints.isEmpty()) {
            sb.append("- Category aliases: ").append(String.join(", ", lexiconHints)).append('\n');
        }
        sb.append("- Never invent sales, stock, or prices; use tools or report intents.\n");
        return sb.toString().trim();
    }
}
