package com.orithos.modules.ai.sommelier.dto;

import java.util.List;

public record IdentifyImageResponse(
        String extractedName,
        String brand,
        String vintage,
        String varietal,
        String barcode,
        List<String> queries,
        List<WineAssistantResponse> items,
        String note
) {
    public IdentifyImageResponse {
        queries = queries == null ? List.of() : List.copyOf(queries);
        items = items == null ? List.of() : List.copyOf(items);
    }
}
