package com.orithos.modules.ai.sommelier;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.modules.ai.AiProperties;
import com.orithos.modules.ai.gateway.AiGateway;
import com.orithos.modules.ai.gateway.AiTask;
import com.orithos.modules.ai.gateway.AiTenantContext;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.report.TenantContextFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Reads a wine-label photo through the remote AI Gateway.
 */
@Service
@ConditionalOnProperty(name = "app.ai.enabled", havingValue = "true")
@EnableConfigurationProperties(AiProperties.class)
public class WineLabelVisionService {

    private static final Logger log = LoggerFactory.getLogger(WineLabelVisionService.class);
    static final long MAX_BYTES = 6L * 1024 * 1024;

    static final String PROMPT = """
            You are reading a photo of a wine bottle label for a liquor store POS.
            Extract the label text. Reply JSON only, no markdown.
            {
              "brand": "",
              "name": "",
              "vintage": "",
              "varietal": "",
              "barcode": "",
              "queries": ["short search phrases a store might use"]
            }
            queries should include the producer + wine name, and a shorter brand + varietal phrase.
            The name field must preserve the exact wine/cuvee/product wording printed on the label,
            separate from producer, vintage, and grape variety. For example, if the label says
            "Vino Rosso", set name to "Vino Rosso". The varietal field is only a grape variety
            such as Shiraz or Cabernet Sauvignon. Style or colour words such as Rosso, Bianco,
            Blanco, Red, White, or Rose are not grape varieties and must not replace the wine name.
            Do not translate or normalize the visible product wording.
            If a barcode/EAN is visible, put digits only in barcode.
            If this is not a wine label, still fill name with any product wording you can read.
            """;

    private final ObjectMapper objectMapper;
    private final AiGateway aiGateway;
    private final TenantContextFactory tenantContextFactory;

    public WineLabelVisionService(
            AiProperties properties,
            ObjectMapper objectMapper,
            AiGateway aiGateway,
            TenantContextFactory tenantContextFactory) {
        this.objectMapper = objectMapper;
        this.aiGateway = aiGateway;
        this.tenantContextFactory = tenantContextFactory;
    }

    public WineLabelRead read(MultipartFile file) {
        if (aiGateway == null) throw new BusinessException(50301, "Remote AI service is not configured.");
        if (file == null || file.isEmpty()) {
            throw new BusinessException(40010, "Photo is required.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new BusinessException(40011, "Photo is too large (max 6 MB).");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new BusinessException(40012, "Failed to read photo.");
        }
        if (bytes.length == 0) {
            throw new BusinessException(40010, "Photo is empty.");
        }

        String mime = resolveMime(file.getContentType(), file.getOriginalFilename());
        try {
            TenantContext scope = tenantContextFactory.fromSecurity();
            Long outlet = scope.requireOutletId();
            if (outlet == null) throw new BusinessException(40100, "Store outlet is required");
            String text = aiGateway.completeMedia(new AiTenantContext(scope.vendorId(), outlet, scope.userId(),
                            com.orithos.config.CorrelationIdContext.current()),
                    AiTask.VISION, PROMPT, mime, bytes, null).value();
            WineLabelRead read = parse(text, objectMapper);
            if (read == null || (blank(read.name()) && blank(read.brand()) && blank(read.barcode())
                    && read.searchQueries().isEmpty())) {
                throw new BusinessException(50212, "Could not read a wine name from that photo. Try a closer shot of the label.");
            }
            return read;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            if (e instanceof BusinessException business) throw business;
            log.warn("Remote AI label vision failed: {}", e.getClass().getSimpleName());
            throw new BusinessException(50213, "Label recognition failed. Check the AI configuration and try again.");
        }
    }

    static WineLabelRead parse(String raw, ObjectMapper mapper) {
        if (!StringUtils.hasText(raw)) return null;
        String json = raw.trim();
        int start = json.indexOf('{');
        int end = json.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        json = json.substring(start, end + 1);
        try {
            JsonNode node = mapper.readTree(json);
            List<String> queries = new ArrayList<>();
            JsonNode qn = node.get("queries");
            if (qn != null && qn.isArray()) {
                for (JsonNode q : qn) {
                    if (q != null && q.isTextual() && StringUtils.hasText(q.asText())) {
                        queries.add(q.asText().trim());
                    }
                }
            }
            return new WineLabelRead(
                    text(node, "brand"),
                    text(node, "name"),
                    text(node, "vintage"),
                    text(node, "varietal"),
                    digits(text(node, "barcode")),
                    queries
            );
        } catch (Exception e) {
            return new WineLabelRead(null, json.replaceAll("\\s+", " ").trim(), null, null, null, List.of());
        }
    }

    static String extractText(JsonNode root) {
        if (root == null) return null;
        JsonNode choices = root.path("choices");
        if (!choices.isArray()) choices = root.path("output").path("choices");
        if (choices.isArray() && !choices.isEmpty()) {
            JsonNode content = choices.get(0).path("message").path("content");
            if (content.isTextual()) return content.asText();
            if (content.isArray()) {
                StringBuilder sb = new StringBuilder();
                for (JsonNode item : content) {
                    if (item.hasNonNull("text")) sb.append(item.get("text").asText());
                    else if (item.isTextual()) sb.append(item.asText());
                }
                return sb.toString();
            }
        }
        return null;
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.get(field);
        if (v == null || v.isNull() || !v.isTextual()) return null;
        String s = v.asText().trim();
        return s.isEmpty() || "null".equalsIgnoreCase(s) ? null : s;
    }

    private static String digits(String raw) {
        if (!StringUtils.hasText(raw)) return null;
        String d = raw.replaceAll("\\D+", "");
        return d.length() >= 8 ? d : null;
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private static String resolveMime(String contentType, String filename) {
        if (StringUtils.hasText(contentType)) {
            String mime = contentType.split(";")[0].trim().toLowerCase(Locale.ROOT);
            if (mime.startsWith("image/")) return mime;
        }
        String name = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".webp")) return "image/webp";
        if (name.endsWith(".gif")) return "image/gif";
        if (name.endsWith(".heic") || name.endsWith(".heif")) return "image/heic";
        return "image/jpeg";
    }

    static String providerErrorCode(JsonNode root) {
        if (root == null) return "";
        JsonNode error = root.path("error");
        String code = root.path("code").asText("");
        if (!StringUtils.hasText(code)) code = error.path("code").asText("");
        if (!StringUtils.hasText(code)) code = root.path("type").asText("");
        if (!StringUtils.hasText(code)) code = error.path("type").asText("");
        return code;
    }

    static String visionFailureMessage(String prefix, String model, String providerCode) {
        String normalized = providerCode == null ? "" : providerCode.toLowerCase(Locale.ROOT);
        if (normalized.equals("model_not_found") || normalized.equals("modelnotexist")) {
            return prefix + ": the configured vision model is unavailable in the remote AI service.";
        }
        if (normalized.equals("invalidparameter") || normalized.equals("invalid_parameter")) {
            return prefix + ": AI provider configuration is invalid. Check the AI configuration and try again.";
        }
        return prefix + ": The AI provider could not process this image. Try again or contact your administrator.";
    }
}
