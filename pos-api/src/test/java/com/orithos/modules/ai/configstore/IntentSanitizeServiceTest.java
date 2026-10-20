package com.orithos.modules.ai.configstore;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class IntentSanitizeServiceTest {

    private final IntentSanitizeService service = configuredService();

    @Test
    void unknownIntentAndUnlistedNavigationOrActionsAreRejected() {
        IntentSanitizeService.SanitizedIntent unknown = service.sanitize(raw("admin_override", null,
                "/products", "open", "inventory", "list", "product", "search"));
        assertEquals("unknown", unknown.intent());
        assertNull(unknown.route());
        assertNull(unknown.action());
        assertNull(unknown.panel());
        assertNull(unknown.view());
        assertTrue(unknown.slots().isEmpty());

        IntentSanitizeService.SanitizedIntent navigation = service.sanitize(raw("navigate", null,
                "/admin/secrets", "run_shell", null, null, null, null));
        assertEquals("navigate", navigation.intent());
        assertNull(navigation.route());
        assertFalse(navigation.slots().containsKey("action"));
    }

    @Test
    void allowedProductSearchRouteAndActionAreCanonicalized() {
        IntentSanitizeService.SanitizedIntent result = service.sanitize(raw("NAVIGATE", "Open products",
                "/products", "OPEN", "inventory", "list", null, null));

        assertEquals("navigate", result.intent());
        assertEquals("/products", result.route());
        assertEquals("open", result.action());
        assertEquals("inventory", result.panel());
        assertEquals("list", result.view());
    }

    @Test
    void aiWorkflowRoutesAreAllowedForNaturalLanguageNavigation() {
        assertEquals("/stock/replenishment", service.sanitize(raw("navigate", "Replenishment",
                "/stock/replenishment", null, null, null, null, null)).route());
        assertEquals("/stock/capped-pricing", service.sanitize(raw("navigate", "Price review",
                "/stock/capped-pricing", null, null, null, null, null)).route());
        assertEquals("/sommelier", service.sanitize(raw("navigate", "Wine recommendations",
                "/sommelier", null, null, null, null, null)).route());
        assertEquals("/invoices/scan", service.sanitize(raw("navigate", "Invoice capture",
                "/invoices/scan", null, null, null, null, null)).route());
    }

    @Test
    void customerCreateActionKeepsOnlyWhitelistedEntityAndOperation() {
        IntentSanitizeService.SanitizedIntent result = service.sanitize(raw("entity_action", "Create customer",
                null, null, null, null, "customer", "create"));

        assertEquals("entity_action", result.intent());
        assertEquals("customer", result.slots().get("entity"));
        assertEquals("create", result.slots().get("op"));
    }

    @Test
    void unsupportedEntityOperationDoesNotFallThroughToDefaultListAction() {
        IntentSanitizeService.SanitizedIntent result = service.sanitize(raw("entity_action", "Run customer action",
                "/customers", null, null, null, "customer", "archive"));

        assertEquals("unknown", result.intent());
        assertTrue(result.slots().isEmpty());
        assertNull(result.route());
    }

    @Test
    void missingEntityOperationCanStillOpenTheEntityList() {
        IntentSanitizeService.SanitizedIntent result = service.sanitize(raw("entity_action", "Open customers",
                null, null, null, null, "customer", null));

        assertEquals("entity_action", result.intent());
        assertEquals("customer", result.slots().get("entity"));
        assertFalse(result.slots().containsKey("op"));
    }

    @Test
    void freeTextQueryIsTrimmedAndCappedToConfiguredLength() {
        IntentSanitizeService.SanitizedIntent result = service.sanitize(
                raw("search_product", "", null, null, null, null, null, null, "  Sauvignon Blanc Reserve  "));

        assertEquals("Sauvignon B", result.slots().get("query"));
        assertEquals(11, result.slots().get("query").length());
    }

    private static IntentSanitizeService.RawIntent raw(String intent, String summary, String route,
                                                       String action, String panel, String view,
                                                       String entity, String op) {
        return raw(intent, summary, route, action, panel, view, entity, op, null);
    }

    private static IntentSanitizeService.RawIntent raw(String intent, String summary, String route,
                                                       String action, String panel, String view,
                                                       String entity, String op, String query) {
        return new IntentSanitizeService.RawIntent(intent, summary, query, route, view, panel, action,
                entity, op, null, null, null, null);
    }

    private static IntentSanitizeService configuredService() {
        AiIntentMapper intents = mock(AiIntentMapper.class);
        AiSlotMapper slots = mock(AiSlotMapper.class);
        AiSlotValueMapper values = mock(AiSlotValueMapper.class);
        AiPromptMapper prompts = mock(AiPromptMapper.class);
        when(intents.findEnabled()).thenReturn(List.of(
                intent("unknown"), intent("navigate"), intent("search_product"), intent("entity_action")));
        when(slots.findEnabled()).thenReturn(List.of(
                slot("query", "string", 11),
                slot("route", "enum", 64),
                slot("view", "enum", 32),
                slot("panel", "enum", 32),
                slot("action", "enum", 32),
                slot("entity", "enum", 32),
                slot("op", "enum", 32)));
        when(values.findEnabled()).thenReturn(List.of(
                value("route", "products", "/products"), value("route", "orders", "/orders"),
                value("route", "replenishment", "/stock/replenishment"),
                value("route", "capped_pricing", "/stock/capped-pricing"),
                value("route", "sommelier", "/sommelier"),
                value("route", "invoice_scan", "/invoices/scan"),
                value("view", "list", "list"), value("panel", "inventory", "inventory"),
                value("action", "open", "open"), value("entity", "customer", "customer"),
                value("entity", "product", "product"), value("op", "create", "create"),
                value("op", "search", "search")));
        IntentConfigService config = new IntentConfigService(intents, slots, values, prompts);
        config.reload();
        return new IntentSanitizeService(config);
    }

    private static AiIntent intent(String code) {
        AiIntent intent = new AiIntent();
        intent.setCode(code);
        intent.setName(code);
        intent.setEnabled(true);
        return intent;
    }

    private static AiSlot slot(String code, String type, int maxLength) {
        AiSlot slot = new AiSlot();
        slot.setCode(code);
        slot.setValueType(type);
        slot.setMaxLength(maxLength);
        slot.setEnabled(true);
        return slot;
    }

    private static AiSlotValue value(String slotCode, String key, String value) {
        AiSlotValue slotValue = new AiSlotValue();
        slotValue.setSlotCode(slotCode);
        slotValue.setValueKey(key);
        slotValue.setValue(value);
        slotValue.setEnabled(true);
        return slotValue;
    }
}
