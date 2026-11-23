package com.orithos.modules.ai.command;

import com.orithos.modules.ai.replenishment.ReplenishmentPlan;
import com.orithos.modules.ai.replenishment.ReplenishmentSuggestion;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiCommandReplenishmentPreviewTest {

    @Test
    void previewShowsReadOnlyQuantityAndCoverageEvidence() {
        ReplenishmentPlan plan = new ReplenishmentPlan(21, 1,
                List.of(new ReplenishmentSuggestion(123, "VB Cans", "Units", 24, 3.0, 1.0,
                        2.0, 3.0, null, 6d)),
                "VALID", List.of(), Instant.parse("2026-11-01T00:00:00Z"));

        AiCommandService.Parsed parsed = AiCommandService.replenishmentPreview("给 VB Cans 补货", plan);

        assertEquals(AiCommandType.PREVIEW_REPLENISHMENT, parsed.type());
        assertEquals(1, parsed.items().size());
        assertEquals(123L, parsed.items().getFirst().id());
        assertEquals("quantity", parsed.items().getFirst().field());
        assertEquals("现有 2 Units；预计可用 3 Units；约 3.0 天覆盖", parsed.items().getFirst().before());
        assertEquals("24", parsed.items().getFirst().after());
        assertTrue(parsed.items().getFirst().reason().contains("日均销量 1.000 件/天"));
        assertTrue(parsed.items().getFirst().reason().contains("4 箱"));
        assertTrue(parsed.summary().contains("数据时间 2026-11-01T00:00:00Z"));
        assertTrue(parsed.changes().containsKey("request"));
        assertTrue(parsed.excluded().isEmpty());
    }

    @Test
    void emptyOrIncompletePlanIsStillAnExplicitReadOnlyPreview() {
        ReplenishmentPlan plan = new ReplenishmentPlan(21, 0, List.of(),
                "DATA_INCOMPLETE", List.of("VB Cans: inventory unavailable"),
                Instant.parse("2026-11-01T00:00:00Z"));

        AiCommandService.Parsed parsed = AiCommandService.replenishmentPreview("生成补货建议", plan);

        assertTrue(parsed.items().isEmpty());
        assertTrue(parsed.summary().contains("数据不完整，无法给出完整结果"));
        assertEquals(1, parsed.excluded().size());
        assertEquals("EXCLUDED", parsed.excluded().getFirst().status());
        assertTrue(parsed.excluded().getFirst().reason().contains("inventory unavailable"));
        assertEquals(AiCommandStatus.PREVIEWED, AiCommandService.initialStatus(parsed));
    }

    @Test
    void replenishmentPreviewCannotBeConfirmedButProductPreviewCan() {
        assertFalse(AiCommandService.requiresConfirmation(
                AiCommandType.PREVIEW_REPLENISHMENT, AiCommandStatus.PREVIEWED));
        assertEquals(AiCommandStatus.PREVIEWED, AiCommandService.initialStatus(
                AiCommandService.replenishmentPreview("generate replenishment", new ReplenishmentPlan(
                        21, 0, List.of(), "VALID", List.of(), Instant.parse("2026-11-01T00:00:00Z")))));
        assertTrue(AiCommandService.requiresConfirmation(
                AiCommandType.UPDATE_PRODUCT, AiCommandStatus.PREVIEWED));
        assertFalse(AiCommandService.requiresConfirmation(
                AiCommandType.UPDATE_PRODUCT, AiCommandStatus.DRAFT));
    }
}
