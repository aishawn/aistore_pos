package com.orithos.modules.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.orithos.common.BusinessException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Cloud STT via DashScope Qwen-ASR OpenAI-compatible API (base64 — no public URL).
 * Calls the HTTP API directly to avoid Spring AI response-mapping quirks that yield empty text.
 */
@Service
@ConditionalOnProperty(name = "app.ai.enabled", havingValue = "true")
public class AiTranscriptionService {

    private static final Logger log = LoggerFactory.getLogger(AiTranscriptionService.class);

    static final long MAX_BYTES = 5L * 1024 * 1024;

    private static final Set<String> ASR_LANGS = Set.of(
            "zh", "en", "yue", "ja", "de", "ko", "ru", "fr", "pt", "ar", "it", "es",
            "hi", "id", "th", "tr", "uk", "vi", "cs", "da", "fil", "fi", "is", "ms", "no", "pl", "sv");

    private final AiProperties properties;
    private final String apiKey;
    private final String baseUrl;
    private final RestClient restClient;

    public AiTranscriptionService(
            AiProperties properties,
            @Value("${spring.ai.dashscope.api-key:}") String apiKey,
            @Value("${spring.ai.dashscope.base-url:https://dashscope.aliyuncs.com}") String baseUrl) {
        this.properties = properties;
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.baseUrl = trimTrailingSlash(baseUrl == null || baseUrl.isBlank()
                ? "https://dashscope.aliyuncs.com"
                : baseUrl.trim());
        this.restClient = RestClient.builder().baseUrl(this.baseUrl).build();
    }

    /**
     * @param file audio blob from the browser (webm/mp4/wav/…)
     * @param lang optional ASR language hint: {@code en}, {@code zh}, or blank for auto-detect
     */
    public String transcribe(MultipartFile file, String lang) {
        if (!StringUtils.hasText(apiKey)) {
            throw new BusinessException(50301, "AI_DASHSCOPE_API_KEY is not configured.");
        }
        if (file == null || file.isEmpty()) {
            throw new BusinessException(40010, "Audio file is required.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new BusinessException(40011, "Audio file is too large (max 5 MB).");
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new BusinessException(40012, "Failed to read audio file.");
        }
        if (bytes.length == 0) {
            throw new BusinessException(40010, "Audio file is empty.");
        }

        String mime = resolveMime(file.getContentType());
        String dataUri = "data:" + mime + ";base64," + Base64.getEncoder().encodeToString(bytes);
        String asrLang = normalizeLang(lang);

        Map<String, Object> inputAudio = Map.of("data", dataUri);
        Map<String, Object> contentItem = Map.of(
                "type", "input_audio",
                "input_audio", inputAudio);
        Map<String, Object> message = Map.of(
                "role", "user",
                "content", List.of(contentItem));

        Map<String, Object> asrOptions = new LinkedHashMap<>();
        asrOptions.put("enable_itn", true);
        if (asrLang != null) {
            asrOptions.put("language", asrLang);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", properties.transcriptionModel());
        body.put("messages", List.of(message));
        body.put("stream", false);
        body.put("asr_options", asrOptions);

        try {
            JsonNode root = restClient.post()
                    .uri("/compatible-mode/v1/chat/completions")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Authorization", "Bearer " + apiKey)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);

            String text = extractText(root);
            if (!StringUtils.hasText(text)) {
                log.warn("Qwen-ASR empty text; bytes={} mime={} lang={} raw={}",
                        bytes.length, mime, asrLang, summarize(root));
                throw new BusinessException(50210,
                        "Transcription returned empty text. Speak clearly and try again.");
            }
            return text.trim();
        } catch (BusinessException e) {
            throw e;
        } catch (RestClientResponseException e) {
            String detail = e.getResponseBodyAsString();
            log.warn("DashScope ASR HTTP {}: {}", e.getStatusCode().value(), detail);
            throw new BusinessException(50211, "Cloud transcription failed: " + shorten(detail, e.getMessage()));
        } catch (Exception e) {
            log.warn("DashScope transcription failed: {}", e.getMessage());
            throw new BusinessException(50211, "Cloud transcription failed: " + e.getMessage());
        }
    }

    /** Pull transcript from OpenAI-compatible or DashScope-native response shapes. */
    static String extractText(JsonNode root) {
        if (root == null) {
            return null;
        }
        JsonNode choices = root.path("choices");
        if (choices.isArray() && !choices.isEmpty()) {
            JsonNode message = choices.get(0).path("message");
            String fromContent = contentToText(message.get("content"));
            if (StringUtils.hasText(fromContent)) {
                return fromContent;
            }
            // Some builds nest text under output
            String fromOutput = contentToText(choices.get(0).get("text"));
            if (StringUtils.hasText(fromOutput)) {
                return fromOutput;
            }
        }
        JsonNode output = root.path("output");
        if (!output.isMissingNode()) {
            String fromChoices = null;
            JsonNode outChoices = output.path("choices");
            if (outChoices.isArray() && !outChoices.isEmpty()) {
                fromChoices = contentToText(outChoices.get(0).path("message").get("content"));
            }
            if (StringUtils.hasText(fromChoices)) {
                return fromChoices;
            }
            String direct = contentToText(output.get("text"));
            if (StringUtils.hasText(direct)) {
                return direct;
            }
        }
        return null;
    }

    private static String contentToText(JsonNode content) {
        if (content == null || content.isNull() || content.isMissingNode()) {
            return null;
        }
        if (content.isTextual()) {
            return content.asText();
        }
        if (content.isArray()) {
            List<String> parts = new ArrayList<>();
            for (JsonNode item : content) {
                if (item.isTextual()) {
                    parts.add(item.asText());
                } else if (item.hasNonNull("text")) {
                    parts.add(item.get("text").asText());
                } else if (item.hasNonNull("content")) {
                    String nested = contentToText(item.get("content"));
                    if (StringUtils.hasText(nested)) {
                        parts.add(nested);
                    }
                }
            }
            return parts.isEmpty() ? null : String.join("", parts);
        }
        if (content.hasNonNull("text")) {
            return content.get("text").asText();
        }
        return null;
    }

    /** Map BCP-47 / UI codes to Qwen-ASR language codes; blank → auto-detect. */
    static String normalizeLang(String lang) {
        if (!StringUtils.hasText(lang)) {
            return null;
        }
        String raw = lang.trim().toLowerCase(Locale.ROOT);
        if ("auto".equals(raw)) {
            return null;
        }
        String primary = raw.contains("-") ? raw.substring(0, raw.indexOf('-')) : raw;
        if ("zh".equals(primary) || "cmn".equals(primary)) {
            return "zh";
        }
        if ("en".equals(primary)) {
            return "en";
        }
        return ASR_LANGS.contains(primary) ? primary : null;
    }

    private static String resolveMime(String contentType) {
        if (!StringUtils.hasText(contentType)) {
            return "audio/webm";
        }
        String mime = contentType.split(";")[0].trim().toLowerCase(Locale.ROOT);
        return mime.isBlank() ? "audio/webm" : mime;
    }

    private static String trimTrailingSlash(String url) {
        while (url.endsWith("/")) {
            url = url.substring(0, url.length() - 1);
        }
        return url;
    }

    private static String summarize(JsonNode root) {
        if (root == null) {
            return "null";
        }
        String s = root.toString();
        return s.length() > 500 ? s.substring(0, 500) + "…" : s;
    }

    private static String shorten(String body, String fallback) {
        if (!StringUtils.hasText(body)) {
            return fallback;
        }
        String t = body.replaceAll("\\s+", " ").trim();
        return t.length() > 240 ? t.substring(0, 240) + "…" : t;
    }
}
