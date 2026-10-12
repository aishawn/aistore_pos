package com.orithos.modules.ai.dto;

import java.util.List;
import java.util.Map;

public record ReportTable(
        List<String> columns,
        List<Map<String, Object>> rows
) {}
