package com.orithos.modules.ai.invoice;

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

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;

import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Reads a supplier tax-invoice photo via the remote AI Gateway.
 */
@Service
@ConditionalOnProperty(name = "app.ai.enabled", havingValue = "true")
@EnableConfigurationProperties(AiProperties.class)
public class InvoiceVisionService {

    private static final Logger log = LoggerFactory.getLogger(InvoiceVisionService.class);
    static final long MAX_BYTES = 8L * 1024 * 1024;
    static final int MIN_IMAGE_DIMENSION = 32;

    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final DateTimeFormatter AU = DateTimeFormatter.ofPattern("d/M/uuuu");
    private static final DateTimeFormatter AU_DASH = DateTimeFormatter.ofPattern("d-M-uuuu");

    private static final String PROMPT = """
            You are reading a photo of a liquor-store supplier TAX INVOICE for a POS.
            Extract the invoice. Reply JSON only, no markdown.
            {
              "supplierName": null,
              "abn": null,
              "website": null,
              "invoiceNumber": null,
              "invoiceDate": null,
              "customerName": null,
              "customerAddress": null,
              "attn": null,
              "phone": null,
              "deliveryFee": null,
              "gstIncluded": null,
              "totalPayable": null,
              "totalCases": null,
              "notes": null,
              "lines": [
                {
                  "description": null,
                  "brand": null,
                  "packQty": null,
                  "qtyCases": null,
                  "unitPrice": null,
                  "lineTotal": null
                }
              ]
            }
            Dates are Australian DD/MM/YYYY on the paper; convert invoiceDate to YYYY-MM-DD.
            Skip empty wine/beer header rows. packQty is units per case. qtyCases is the Qty column (cases).
            unitPrice is the Price column (per case, GST inclusive). Use numbers, not currency symbols.
            Transcribe only values visibly printed on the invoice. Never calculate missing values or change printed values to make them agree.
            Compare printed figures only to detect a conflict; if the printed total differs from printed subtotal, GST, or line totals, preserve each visible value and state the conflict in notes for human review.
            For every numeric field, return a JSON number without currency symbols; never return true/false or a formatted currency string.
            gstIncluded is the numeric tax amount printed next to a GST, GST amount, or GST included label. Do not require the exact words "GST included" and do not infer GST from totals or line items. If no GST amount is printed, return null.
            Treat glare, specular reflection, bloom, washed-out pixels, and any light reflection over a number or label as obscured and uncertain. Set every affected field to JSON null and state the affected field in a human-review note; never copy a plausible value from surrounding context.
            If a field is absent, obscured, or uncertain, return JSON null. Do not infer an obscured amount from line items or other totals.
            Do not infer totalPayable from line items, or line values from multiplication. If printed totals conflict, preserve the printed values and state "Totals conflict; human review required" in notes.
            If any key amount or identifier is obscured or uncertain, set that field to null, state "Human review required", and name the field in notes.
            Never return a value for a field that notes explicitly describe as obscured or uncertain.
            """;

    private final AiProperties properties;
    private final ObjectMapper objectMapper;
    private final AiGateway aiGateway;
    private final TenantContextFactory tenantContextFactory;

    public InvoiceVisionService(
            AiProperties properties,
            ObjectMapper objectMapper,
            AiGateway aiGateway,
            TenantContextFactory tenantContextFactory) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.aiGateway = aiGateway;
        this.tenantContextFactory = tenantContextFactory;
    }

    public TaxInvoiceRead read(MultipartFile file) {
        return readPrepared(prepare(file));
    }

    PreparedInvoiceImage prepare(MultipartFile file) {
        if (aiGateway == null) throw new BusinessException(50301, "Remote AI service is not configured.");
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
        if ("application/pdf".equals(mime)) {
            bytes = rasterizePdf(bytes);
            mime = "image/jpeg";
        }
        validateImage(bytes);
        return new PreparedInvoiceImage(mime, bytes);
    }

    TaxInvoiceRead readPrepared(PreparedInvoiceImage prepared) {
        if (prepared == null) throw new BusinessException(40010, "Photo is required.");
        String mime = prepared.mime();
        byte[] bytes = prepared.bytes();
        try {
            TenantContext scope = tenantContextFactory.fromSecurity();
            Long outlet = scope.requireOutletId();
            if (outlet == null) throw new BusinessException(40100, "Store outlet is required");
            String text = aiGateway.completeMedia(new AiTenantContext(scope.vendorId(), outlet, scope.userId(),
                            com.orithos.config.CorrelationIdContext.current()),
                    AiTask.VISION, PROMPT, mime, bytes, null).value();
            TaxInvoiceRead read = parse(text, objectMapper);
            if (read == null || (!StringUtils.hasText(read.invoiceNumber())
                    && !StringUtils.hasText(read.supplierName())
                    && (read.lines() == null || read.lines().isEmpty()))) {
                throw new BusinessException(50212, "Could not read an invoice from that photo. Try a flatter, closer shot.");
            }
            return read;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            if (e instanceof BusinessException business) throw business;
            log.warn("Remote AI invoice vision failed: {}", e.getClass().getSimpleName());
            throw new BusinessException(50213, "Invoice recognition failed. Check the AI configuration and try again.");
        }
    }

    record PreparedInvoiceImage(String mime, byte[] bytes) {}

    /** Reject malformed or clearly unusable images before spending provider quota. */
    static void validateImage(byte[] bytes) {
        try (ByteArrayInputStream input = new ByteArrayInputStream(bytes)) {
            BufferedImage image = ImageIO.read(input);
            if (image == null || image.getWidth() < MIN_IMAGE_DIMENSION || image.getHeight() < MIN_IMAGE_DIMENSION) {
                throw new BusinessException(40013, "Photo is not a usable invoice image. Upload a clear image at least 32x32 pixels.");
            }
        } catch (IOException e) {
            throw new BusinessException(40013, "Photo is not a usable invoice image. Upload a JPEG, PNG, or PDF invoice.");
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
            if (mime.startsWith("image/") || "application/pdf".equals(mime)) return mime;
        }
        String name = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        if (name.endsWith(".pdf")) return "application/pdf";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".webp")) return "image/webp";
        if (name.endsWith(".gif")) return "image/gif";
        if (name.endsWith(".heic") || name.endsWith(".heif")) return "image/heic";
        return "image/jpeg";
    }

    /** Render up to three PDF pages into one JPEG for vision OCR. */
    static byte[] rasterizePdf(byte[] pdfBytes) {
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            if (document.getNumberOfPages() < 1) {
                throw new BusinessException(40010, "PDF has no pages.");
            }
            PDFRenderer renderer = new PDFRenderer(document);
            int pages = Math.min(document.getNumberOfPages(), 3);
            List<BufferedImage> images = new ArrayList<>(pages);
            int width = 0;
            int height = 0;
            for (int i = 0; i < pages; i++) {
                BufferedImage page = renderer.renderImageWithDPI(i, 144, ImageType.RGB);
                images.add(page);
                width = Math.max(width, page.getWidth());
                height += page.getHeight();
            }
            BufferedImage collage = new BufferedImage(Math.max(width, 1), Math.max(height, 1), BufferedImage.TYPE_INT_RGB);
            Graphics2D graphics = collage.createGraphics();
            int y = 0;
            for (BufferedImage page : images) {
                graphics.drawImage(page, 0, y, null);
                y += page.getHeight();
            }
            graphics.dispose();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            if (!ImageIO.write(collage, "jpg", out)) {
                throw new BusinessException(40012, "Could not convert PDF pages for OCR.");
            }
            byte[] jpeg = out.toByteArray();
            if (jpeg.length > MAX_BYTES) {
                throw new BusinessException(40011, "Converted PDF is too large (max 8 MB). Try fewer pages or a smaller file.");
            }
            return jpeg;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(40012, "Could not read that PDF. Try exporting the first pages as images.");
        }
    }

}
