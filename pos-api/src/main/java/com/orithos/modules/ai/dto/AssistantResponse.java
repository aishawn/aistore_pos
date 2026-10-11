package com.orithos.modules.ai.dto;

import java.util.Map;

public record AssistantResponse(
        String threadId,
        String intent,
        String intentSummary,
        String answer,
        Map<String, String> slots,
        UiAction ui,
        ReportTable table,
        Long reportId
) {}
