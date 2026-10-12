package com.orithos.modules.ai.sommelier.dto;

import java.util.List;

public record IdentifyResponse(
        List<WineAssistantResponse> items
) {}
