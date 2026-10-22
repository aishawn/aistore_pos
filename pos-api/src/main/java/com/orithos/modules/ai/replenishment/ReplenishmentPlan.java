package com.orithos.modules.ai.replenishment;

import java.util.List;

/** Read-only replenishment plan slice used by the assistant chat brief. */
public record ReplenishmentPlan(int coverageDays, int itemsNeedingOrder, List<ReplenishmentSuggestion> top) {
}
