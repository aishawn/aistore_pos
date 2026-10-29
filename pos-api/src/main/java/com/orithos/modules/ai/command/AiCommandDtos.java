package com.orithos.modules.ai.command;

import jakarta.validation.constraints.NotBlank;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class AiCommandDtos {
    private AiCommandDtos() { }

    public record ParseRequest(@NotBlank String text, String threadId, String surface) { }

    public record ConfirmRequest(@NotBlank String confirmationText,
                                 String confirmationMode,
                                 String expectedVersion) { }

    public record CommandItem(Long id, String name, String field, Object before,
                              Object after, String evidence, String exclusionReason,
                              String sourceVersion) { }

    public record CommandResponse(UUID commandId, AiCommandType type, AiCommandStatus status,
                                  double confidence, boolean requiresConfirmation,
                                  String summary, List<CommandItem> items,
                                  List<CommandItem> excludedItems, Instant expiresAt,
                                  String version, String error) { }

    /** Strict model output. Context and authorization are never model fields. */
    public record ParsedCommand(String type, double confidence, String summary,
                                List<ParsedItem> items, Map<String, Object> changes) { }

    public record ParsedItem(Long id, String name, String field, Object before,
                             Object after, String evidence) { }
}
