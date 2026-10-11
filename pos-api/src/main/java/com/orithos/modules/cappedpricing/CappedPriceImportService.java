package com.orithos.modules.cappedpricing;

import com.orithos.common.BusinessException;
import com.orithos.common.CsvParser;
import com.orithos.modules.cappedpricing.mapper.CappedPriceMapper;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class CappedPriceImportService {

    private static final String SOURCE_TYPE = "IMPORTED";

    private static final DateTimeFormatter[] DATE_FORMATS = {
            DateTimeFormatter.ISO_LOCAL_DATE,
            DateTimeFormatter.ofPattern("d/M/yyyy"),
            DateTimeFormatter.ofPattern("M/d/yyyy"),
            DateTimeFormatter.ofPattern("yyyy/M/d"),
    };

    private final CappedPriceMapper mapper;

    public CappedPriceImportService(CappedPriceMapper mapper) {
        this.mapper = mapper;
    }

    public CappedPriceImportResult importCsv(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new BusinessException("Please select a CSV file to import.");
        }

        String text = new String(file.getBytes(), StandardCharsets.UTF_8);
        List<String[]> rows = CsvParser.parse(text);
        if (rows.isEmpty()) {
            throw new BusinessException("The CSV file is empty.");
        }

        Map<String, Integer> columnIndex = mapHeaders(rows.getFirst());
        requireColumn(columnIndex, "product");
        requireColumn(columnIndex, "capped pricing");
        requireColumn(columnIndex, "capped price");

        int imported = 0;
        int skipped = 0;
        List<CappedPriceImportError> errors = new ArrayList<>();

        for (int i = 1; i < rows.size(); i++) {
            String[] cells = rows.get(i);
            int rowNum = i + 1;
            try {
                String productKey = cell(cells, columnIndex.get("product"));
                if (productKey.isBlank()) {
                    skipped++;
                    continue;
                }
                Long productId = mapper.findProductId(productKey);
                if (productId == null) {
                    throw new BusinessException("Product not found: " + productKey);
                }

                String source = cell(cells, columnIndex.get("capped pricing"));
                if (source.isBlank()) {
                    throw new BusinessException("Capped Pricing (source) is required.");
                }

                BigDecimal quantity = parseDecimal(cell(cells, columnIndex.get("quantity")), BigDecimal.ONE);
                if (quantity.compareTo(BigDecimal.ZERO) <= 0) {
                    throw new BusinessException("Quantity must be greater than zero.");
                }

                BigDecimal cappedPrice = parseDecimal(cell(cells, columnIndex.get("capped price")), null);
                if (cappedPrice == null) {
                    throw new BusinessException("Capped Price is required.");
                }

                mapper.insertImported(
                        productId,
                        source,
                        SOURCE_TYPE,
                        cell(cells, columnIndex.get("price set")),
                        parseDate(cell(cells, columnIndex.get("start date"))),
                        parseDate(cell(cells, columnIndex.get("end date"))),
                        quantity,
                        cappedPrice);
                imported++;
            } catch (BusinessException ex) {
                errors.add(new CappedPriceImportError(rowNum, ex.getMessage()));
            } catch (Exception ex) {
                errors.add(new CappedPriceImportError(rowNum, ex.getMessage() != null ? ex.getMessage() : "Import failed"));
            }
        }

        return new CappedPriceImportResult(imported, skipped, errors);
    }

    private static void requireColumn(Map<String, Integer> columnIndex, String name) {
        if (!columnIndex.containsKey(name)) {
            throw new BusinessException("CSV must include a " + name + " column.");
        }
    }

    private static Map<String, Integer> mapHeaders(String[] headers) {
        Map<String, Integer> map = new HashMap<>();
        for (int i = 0; i < headers.length; i++) {
            String key = headers[i].trim().toLowerCase(Locale.ROOT);
            if (!key.isEmpty()) {
                map.put(key, i);
            }
        }
        return map;
    }

    private static String cell(String[] cells, Integer index) {
        if (index == null || index < 0 || index >= cells.length) return "";
        return cells[index].trim();
    }

    private static BigDecimal parseDecimal(String raw, BigDecimal defaultValue) {
        if (raw == null || raw.isBlank()) return defaultValue;
        String normalized = raw.replace("$", "").replace(",", "").trim();
        if (normalized.isEmpty()) return defaultValue;
        try {
            return new BigDecimal(normalized);
        } catch (NumberFormatException ex) {
            throw new BusinessException("Invalid number: " + raw);
        }
    }

    private static LocalDate parseDate(String raw) {
        if (raw == null || raw.isBlank()) return null;
        for (DateTimeFormatter fmt : DATE_FORMATS) {
            try {
                return LocalDate.parse(raw.trim(), fmt);
            } catch (DateTimeParseException ignored) {
                /* try next */
            }
        }
        throw new BusinessException("Invalid date: " + raw);
    }
}
