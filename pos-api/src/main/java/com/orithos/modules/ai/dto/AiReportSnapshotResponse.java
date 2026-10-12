package com.orithos.modules.ai.dto;

import java.time.LocalDateTime;
import java.util.Map;

public record AiReportSnapshotResponse(
        Long id,
        String intent,
        String question,
        String title,
        ReportTable table,
        Map<String, String> slots,
        LocalDateTime createdAt
) {}
