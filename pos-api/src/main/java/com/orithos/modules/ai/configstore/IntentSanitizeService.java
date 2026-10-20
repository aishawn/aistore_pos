package com.orithos.modules.ai.configstore;

import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Validates LLM intent + slots against DB whitelists.
 * Unknown intent → unknown; enum slots not in whitelist → dropped.
 */
@Service
public class IntentSanitizeService {

    public static final String UNKNOWN = "unknown";

    private final IntentConfigService configService;

    public IntentSanitizeService(IntentConfigService configService) {
        this.configService = configService;
    }

    public SanitizedIntent sanitize(RawIntent raw) {
        IntentConfigService.Snapshot snap = configService.getSnapshot();

        String intentCode = raw.intent() == null ? UNKNOWN : raw.intent().trim().toLowerCase(Locale.ROOT);
        if (!snap.isKnownIntent(intentCode) || UNKNOWN.equals(intentCode)) {
            return new SanitizedIntent(UNKNOWN, blankToDefault(raw.summary(), "Unrecognized"), Map.of(),
                    null, null, null, null);
        }

        AiIntent def = snap.intent(intentCode);
        Map<String, String> slots = new LinkedHashMap<>();

        putSlot(snap, slots, "query", raw.query());
        putSlot(snap, slots, "route", raw.route());
        putSlot(snap, slots, "view", raw.view());
        putSlot(snap, slots, "panel", raw.panel());
        putSlot(snap, slots, "action", raw.action());
        putSlot(snap, slots, "entity", raw.entity());
        putSlot(snap, slots, "op", raw.op());
        putSlot(snap, slots, "from", raw.from());
        putSlot(snap, slots, "to", raw.to());
        putSlot(snap, slots, "days", raw.days());
        putSlot(snap, slots, "category", raw.category());

        String panel = firstNonBlank(slots.get("panel"), def != null ? def.getDefaultPanel() : null);
        String view = firstNonBlank(slots.get("view"), def != null ? def.getDefaultView() : null);
        String route = slots.get("route");
        String action = slots.get("action");

        panel = resolveEnum(snap, "panel", panel);
        view = resolveEnum(snap, "view", view);
        route = resolveEnum(snap, "route", route);
        action = resolveEnum(snap, "action", action);

        if (panel != null) slots.put("panel", panel);
        if (view != null) slots.put("view", view);
        if (route != null) slots.put("route", route);
        if (action != null) slots.put("action", action);

        return new SanitizedIntent(
                intentCode,
                blankToDefault(raw.summary(), def != null ? def.getName() : intentCode),
                slots,
                panel,
                view,
                route,
                action
        );
    }

    private void putSlot(IntentConfigService.Snapshot snap, Map<String, String> out, String code, String rawValue) {
        if (rawValue == null || rawValue.isBlank()) return;
        AiSlot slot = snap.slotByCode().get(code);
        if (slot == null) return;

        String trimmed = rawValue.trim();
        int max = slot.getMaxLength() == null ? 100 : slot.getMaxLength();
        if (trimmed.length() > max) {
            trimmed = trimmed.substring(0, max);
        }

        if ("enum".equalsIgnoreCase(slot.getValueType())) {
            String resolved = resolveEnum(snap, code, trimmed);
            if (resolved != null) {
                out.put(code, resolved);
            }
            return;
        }
        out.put(code, trimmed);
    }

    private String resolveEnum(IntentConfigService.Snapshot snap, String slotCode, String raw) {
        if (raw == null || raw.isBlank()) return null;
        Map<String, String> allowed = snap.enumValues(slotCode);
        if (allowed.isEmpty()) return null;
        return allowed.get(IntentConfigService.normalizeKey(raw));
    }

    private static String firstNonBlank(String a, String b) {
        if (a != null && !a.isBlank()) return a;
        if (b != null && !b.isBlank()) return b;
        return null;
    }

    private static String blankToDefault(String v, String d) {
        return v == null || v.isBlank() ? d : v.trim();
    }

    public record RawIntent(
            String intent,
            String summary,
            String query,
            String route,
            String view,
            String panel,
            String action,
            String entity,
            String op,
            String from,
            String to,
            String days,
            String category
    ) {}

    public record SanitizedIntent(
            String intent,
            String summary,
            Map<String, String> slots,
            String panel,
            String view,
            String route,
            String action
    ) {}
}
