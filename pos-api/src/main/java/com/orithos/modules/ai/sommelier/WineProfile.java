package com.orithos.modules.ai.sommelier;

import java.util.List;

/**
 * Structured tasting profile used by matching. Values are 0–1 when present.
 */
public record WineProfile(
        String wineType,
        String varietal,
        String region,
        String vintage,
        Double dryness,
        Double body,
        Double fruitiness,
        Double oak,
        Double tannin,
        List<String> aromaTags,
        List<String> palateTags,
        List<String> foodTags,
        String finishNote,
        boolean inferred
) {
    public WineProfile {
        aromaTags = aromaTags == null ? List.of() : List.copyOf(aromaTags);
        palateTags = palateTags == null ? List.of() : List.copyOf(palateTags);
        foodTags = foodTags == null ? List.of() : List.copyOf(foodTags);
    }

    public static WineProfile empty(String wineType) {
        return new WineProfile(wineType, null, null, null, null, null, null, null, null,
                List.of(), List.of(), List.of(), null, true);
    }
}
