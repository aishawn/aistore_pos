package com.orithos.modules.ai.command;

import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class AiCommandDtos {
    private AiCommandDtos() {}

    public record ParseRequest(@NotBlank String text, String threadId, String surface) {}
    public record ConfirmRequest(@NotBlank String confirmationText, String confirmationMode,
                                 String expectedVersion) {}
    public record CommandItem(Long id, String name, String field, Object before, Object after,
                              String reason, String status) {}
    public record CommandResponse(UUID commandId, AiCommandType type, AiCommandStatus status,
                                  BigDecimal confidence, boolean requiresConfirmation,
                                  String summary, List<CommandItem> items,
                                  List<CommandItem> excludedItems, Map<String, Object> changes,
                                  Instant expiresAt, String version, List<String> writeRequests) {}
}
