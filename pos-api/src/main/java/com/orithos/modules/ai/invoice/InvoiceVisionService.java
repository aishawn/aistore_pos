package com.orithos.modules.ai.invoice;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.modules.ai.AiProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Reads a supplier tax-invoice photo via DashScope Qwen-VL.
 */
@Service
@ConditionalOnProperty(name = "app.ai.enabled", havingValue = "true")
@EnableConfigurationProperties(AiProperties.class)
public class InvoiceVisionService {

    private static final Logger log = LoggerFactory.getLogger(InvoiceVisionService.class);
    static final long MAX_BYTES = 8L * 1024 * 1024;

    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final DateTimeFormatter AU = DateTimeFormatter.ofPattern("d/M/uuuu");
    private static final DateTimeFormatter AU_DASH = DateTimeFormatter.ofPattern("d-M-uuuu");

    private static final String PROMPT = """
            You are reading a photo of a liquor-store supplier TAX INVOICE for a POS.
            Extract the invoice. Reply JSON only, no markdown.
            {
              "supplierName": "",
              "abn": "",
              "website": "",
              "invoiceNumber": "",
              "invoiceDate": "YYYY-MM-DD",
              "customerName": "",
              "customerAddress": "",
              "attn": "",
              "phone": "",
              "deliveryFee": 0,
              "gstIncluded": 0,
              "totalPayable": 0,
              "totalCases": 0,
              "notes": "",
              "lines": [
                {
                  "description": "",
                  "brand": "",
                  "packQty": 0,
                  "qtyCases": 0,
                  "unitPrice": 0,
                  "lineTotal": 0
                }
              ]
            }
            Dates are Australian DD/MM/YYYY on the paper; convert invoiceDate to YYYY-MM-DD.
            Skip empty wine/beer header rows. packQty is units per case. qtyCases is the Qty column (cases).
            unitPrice is the Price column (per case, GST inclusive). Use numbers, not currency symbols.
            """;

    private final AiProperties properties;
    private final ObjectMapper objectMapper;
    private final String apiKey;
    private final String baseUrl;
    private final RestClient restClient;

    public InvoiceVisionService(
            AiProperties properties,
            ObjectMapper objectMapper,
            @Value("${spring.ai.dashscope.api-key:}") String apiKey,
            @Value("${spring.ai.dashscope.base-url:https://dashscope.aliyuncs.com}") String baseUrl) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.baseUrl = trimTrailingSlash(baseUrl == null || baseUrl.isBlank()
                ? "https://dashscope.aliyuncs.com"
                : baseUrl.trim());
        this.restClient = RestClient.builder().baseUrl(this.baseUrl).build();
    }

    public TaxInvoiceRead read(MultipartFile file) {
        if (!StringUtils.hasText(apiKey)) {
            throw new BusinessException(50301, "AI_DASHSCOPE_API_KEY is not configured.");
        }
        if (file == null || file.isEmpty()) {
            throw new BusinessException(40010, "Photo is required.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new BusinessException(40011, "Photo is too large (max 8 MB).");
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
        String dataUri = "data:" + mime + ";base64," + Base64.getEncoder().encodeToString(bytes);

        Map<String, Object> imageUrl = Map.of("url", dataUri);
        List<Map<String, Object>> content = List.of(
                Map.of("type", "image_url", "image_url", imageUrl),
                Map.of("type", "text", "text", PROMPT)
        );
        Map<String, Object> message = Map.of("role", "user", "content", content);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", properties.visionModel());
        body.put("messages", List.of(message));
        body.put("stream", false);

        try {
            JsonNode root = restClient.post()
                    .uri("/compatible-mode/v1/chat/completions")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Authorization", "Bearer " + apiKey)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
            String text = extractText(root);
            TaxInvoiceRead read = parse(text, objectMapper);
            if (read == null || (!StringUtils.hasText(read.invoiceNumber())
                    && !StringUtils.hasText(read.supplierName())
                    && (read.lines() == null || read.lines().isEmpty()))) {
                throw new BusinessException(50212, "Could not read an invoice from that photo. Try a flatter, closer shot.");
            }
            return read;
        } catch (BusinessException e) {
            throw e;
        } catch (RestClientResponseException e) {
            log.warn("DashScope VL HTTP {}: {}", e.getStatusCode().value(), e.getResponseBodyAsString());
            throw new BusinessException(50213, visionFailureMessage(
                    "Invoice recognition failed", properties.visionModel(), e.getResponseBodyAsString(), e.getMessage()));
        } catch (Exception e) {
            log.warn("DashScope VL failed: {}", e.getMessage());
            throw new BusinessException(50213, "Invoice recognition failed. Check the AI configuration and try again.");
        }
    }

    static TaxInvoiceRead parse(String raw, ObjectMapper mapper) {
        if (!StringUtils.hasText(raw)) return null;
        String json = raw.trim();
        int start = json.indexOf('{');
        int end = json.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        json = json.substring(start, end + 1);
        try {
            JsonNode node = mapper.readTree(json);
            List<TaxInvoiceRead.Line> lines = new ArrayList<>();
            JsonNode ln = node.get("lines");
            if (ln != null && ln.isArray()) {
                for (JsonNode row : ln) {
                    if (row == null || !row.isObject()) continue;
                    String description = text(row, "description");
                    if (!StringUtils.hasText(description)) continue;
                    lines.add(new TaxInvoiceRead.Line(
                            description,
                            text(row, "brand"),
                            decimal(row, "packQty"),
                            decimal(row, "qtyCases"),
                            decimal(row, "unitPrice"),
                            decimal(row, "lineTotal")
                    ));
                }
            }
            return new TaxInvoiceRead(
                    text(node, "supplierName"),
                    text(node, "abn"),
                    text(node, "website"),
                    text(node, "invoiceNumber"),
                    parseDate(text(node, "invoiceDate")),
                    text(node, "customerName"),
                    text(node, "customerAddress"),
                    text(node, "attn"),
                    text(node, "phone"),
                    decimal(node, "deliveryFee"),
                    decimal(node, "gstIncluded"),
                    decimal(node, "totalPayable"),
                    decimal(node, "totalCases"),
                    text(node, "notes"),
                    lines
            );
        } catch (Exception e) {
            return null;
        }
    }

    static String extractText(JsonNode root) {
        if (root == null) return null;
        JsonNode choices = root.path("choices");
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

    static LocalDate parseDate(String raw) {
        if (!StringUtils.hasText(raw)) return null;
        String s = raw.trim();
        for (DateTimeFormatter fmt : List.of(ISO, AU, AU_DASH)) {
            try {
                return LocalDate.parse(s, fmt);
            } catch (DateTimeParseException ignored) {
                // try next
            }
        }
        return null;
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.get(field);
        if (v == null || v.isNull()) return null;
        String s = v.isNumber() ? v.asText() : v.asText("").trim();
        return s.isEmpty() || "null".equalsIgnoreCase(s) ? null : s;
    }

    private static BigDecimal decimal(JsonNode node, String field) {
        JsonNode v = node.get(field);
        if (v == null || v.isNull()) return null;
        if (v.isNumber()) return v.decimalValue();
        String s = v.asText("").replace("$", "").replace(",", "").trim();
        if (s.isEmpty()) return null;
        try {
            return new BigDecimal(s);
        } catch (NumberFormatException e) {
            return null;
        }
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

    private static String trimTrailingSlash(String url) {
        while (url.endsWith("/")) url = url.substring(0, url.length() - 1);
        return url;
    }

    private static String shorten(String body, String fallback) {
        if (!StringUtils.hasText(body)) return fallback;
        String t = body.replaceAll("\\s+", " ").trim();
        return t.length() > 240 ? t.substring(0, 240) + "…" : t;
    }

    static String visionFailureMessage(String prefix, String model, String body, String fallback) {
        String detail = shorten(body, fallback);
        if (detail != null && detail.toLowerCase(Locale.ROOT).matches("(?s).*(model_not_found|model not exist).*")) {
            return prefix + ": vision model \"" + model + "\" is not available for this DashScope key/region. "
                    + "Set AI_VISION_MODEL (for example qwen-vl-max or qwen3-vl-plus) and confirm AI_DASHSCOPE_BASE_URL matches the key region.";
        }
        if (detail != null && detail.toLowerCase(Locale.ROOT).matches("(?s).*(invalidparameter|url error|request_id|dashscope).*")) {
            return prefix + ": AI provider configuration is invalid. Check the AI configuration and try again.";
        }
        return prefix + ": " + detail;
    }
}
