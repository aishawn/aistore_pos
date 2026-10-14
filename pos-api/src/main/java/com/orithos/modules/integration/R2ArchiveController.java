package com.orithos.modules.integration;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.security.AdminAccess;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Admin-only status and manual trigger for the isolated Shopfront R2 mirror. */
@RestController
@RequestMapping("/api/r2-archive")
public class R2ArchiveController {
    private final ObjectMapper objectMapper;
    private final Path dataDir;
    private final String syncTimezone;
    private final int syncHour;
    private final int syncMinute;

    public R2ArchiveController(
            ObjectMapper objectMapper,
            @Value("${R2_ARCHIVE_DATA_DIR:/var/lib/orithos/shopfront}") String dataDir,
            @Value("${R2_SYNC_TIMEZONE:Australia/Adelaide}") String syncTimezone,
            @Value("${R2_SYNC_HOUR:3}") int syncHour,
            @Value("${R2_SYNC_MINUTE:30}") int syncMinute) {
        this.objectMapper = objectMapper;
        this.dataDir = Path.of(dataDir);
        this.syncTimezone = syncTimezone;
        this.syncHour = syncHour;
        this.syncMinute = syncMinute;
    }

    @GetMapping("/status")
    public ApiResult<Map<String, Object>> status() {
        AdminAccess.requireAdmin();
        Path statusFile = dataDir.resolve("status.json");
        if (!Files.isRegularFile(statusFile)) {
            Map<String, Object> emptyStatus = new LinkedHashMap<>();
            emptyStatus.put("configured", false);
            emptyStatus.put("state", "not_configured");
            emptyStatus.put("timezone", syncTimezone);
            emptyStatus.put("scheduleTime", scheduleTime());
            return ApiResult.ok(emptyStatus);
        }
        try {
            Map<String, Object> workerStatus = objectMapper.readValue(
                    statusFile.toFile(), new TypeReference<>() {});
            Map<String, Object> snapshot = mapValue(workerStatus.get("snapshot"));
            Map<String, Object> safeSnapshot = new LinkedHashMap<>();
            for (String field : List.of("syncedAt", "manifestSha256", "databaseIntegrity")) {
                if (snapshot.containsKey(field)) safeSnapshot.put(field, snapshot.get(field));
            }
            Object rawFiles = snapshot.get("files");
            if (rawFiles instanceof List<?> files) {
                safeSnapshot.put("files", files.stream().map(this::safeFile).toList());
            }
            Map<String, Object> safeStatus = new LinkedHashMap<>();
            for (String field : List.of("configured", "state", "reason", "lastAttemptAt", "lastSuccessAt",
                    "nextRunAt", "timezone", "snapshotId", "lastErrorCode", "checkedAt")) {
                if (workerStatus.containsKey(field)) safeStatus.put(field, workerStatus.get(field));
            }
            safeStatus.putIfAbsent("timezone", syncTimezone);
            safeStatus.put("scheduleTime", scheduleTime());
            safeStatus.put("snapshot", safeSnapshot);
            return ApiResult.ok(safeStatus);
        } catch (IOException e) {
            return ApiResult.ok(Map.of("configured", true, "state", "status_unavailable"));
        }
    }

    private String scheduleTime() {
        return "%02d:%02d".formatted(syncHour, syncMinute);
    }

    @PostMapping("/sync")
    public ApiResult<Map<String, String>> requestSync() {
        AdminAccess.requireAdmin();
        Path requestFile = dataDir.resolve("REQUEST_SYNC");
        try {
            Files.createDirectories(dataDir);
            Files.writeString(requestFile, Long.toString(System.currentTimeMillis()), StandardCharsets.US_ASCII,
                    StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
            return ApiResult.ok(Map.of("state", "queued"));
        } catch (IOException e) {
            throw new BusinessException(50300, "R2 sync worker is unavailable");
        }
    }

    private Map<String, Object> mapValue(Object value) {
        if (!(value instanceof Map<?, ?> map)) return Map.of();
        Map<String, Object> result = new LinkedHashMap<>();
        map.forEach((key, item) -> { if (key instanceof String name) result.put(name, item); });
        return result;
    }

    private Map<String, Object> safeFile(Object value) {
        Map<String, Object> file = mapValue(value);
        Map<String, Object> safe = new LinkedHashMap<>();
        for (String field : List.of("name", "sizeBytes", "sha256")) {
            if (file.containsKey(field)) safe.put(field, file.get(field));
        }
        return safe;
    }
}
