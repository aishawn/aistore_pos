package com.orithos.modules.product;

import com.orithos.common.BusinessException;
import com.orithos.common.ExcelUtils;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class ProductImportService {

    private static final String[] TEMPLATE_HEADERS = {
            "Name", "Category", "Cost", "Price", "Status"
    };

    private final ProductService productService;

    public ProductImportService(ProductService productService) {
        this.productService = productService;
    }

    public byte[] importTemplateXlsx() throws IOException {
        return ExcelUtils.writeXlsx("Products", TEMPLATE_HEADERS,
                new String[]{"Sample Product", "Beer Local", "3.00", "6.80", "ACTIVE"});
    }

    public ProductImportResult importCsv(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new BusinessException("Please select a file to import.");
        }

        List<String[]> rows = ExcelUtils.parseSpreadsheet(file);
        if (rows.isEmpty()) {
            throw new BusinessException("The import file is empty.");
        }

        String[] headers = rows.getFirst();
        Map<String, Integer> columnIndex = mapHeaders(headers);
        if (!columnIndex.containsKey("name")) {
            throw new BusinessException("File must include a Name column.");
        }

        int imported = 0;
        int skipped = 0;
        List<ProductImportError> errors = new ArrayList<>();

        for (int i = 1; i < rows.size(); i++) {
            String[] cells = rows.get(i);
            int rowNum = i + 1;
            try {
                Product product = toProduct(cells, columnIndex);
                if (product == null) {
                    skipped++;
                    continue;
                }
                productService.create(product);
                imported++;
            } catch (BusinessException e) {
                errors.add(new ProductImportError(rowNum, e.getMessage()));
            } catch (Exception e) {
                errors.add(new ProductImportError(rowNum, e.getMessage() != null ? e.getMessage() : "Import failed"));
            }
        }

        if (imported == 0 && errors.isEmpty() && skipped > 0) {
            throw new BusinessException("No product rows found in the import file.");
        }
        if (imported == 0 && !errors.isEmpty()) {
            throw new BusinessException(formatErrorSummary(errors));
        }

        return new ProductImportResult(imported, skipped, errors);
    }

    private static String formatErrorSummary(List<ProductImportError> errors) {
        ProductImportError first = errors.getFirst();
        String extra = errors.size() > 1 ? " (and " + (errors.size() - 1) + " more)" : "";
        return "Row " + first.row() + ": " + first.message() + extra;
    }

    private static Map<String, Integer> mapHeaders(String[] headers) {
        Map<String, Integer> map = new HashMap<>();
        for (int i = 0; i < headers.length; i++) {
            String key = normalizeHeader(headers[i]);
            if (!key.isEmpty()) map.putIfAbsent(key, i);
        }
        return map;
    }

    private static String normalizeHeader(String header) {
        if (header == null) return "";
        return header.trim().toLowerCase(Locale.ROOT)
                .replace("product name", "name")
                .replace("product", "name")
                .replace("retail price", "price")
                .replace("sell price", "price");
    }

    private Product toProduct(String[] cells, Map<String, Integer> columns) {
        String name = cell(cells, columns.get("name"));
        if (name == null || name.isBlank()) {
            if (rowHasData(cells)) {
                throw new BusinessException("Name is required.");
            }
            return null;
        }

        Product product = new Product();
        product.setName(name.trim());
        product.setCost(parseAmount(cell(cells, columns.get("cost"))));
        product.setPrice(parseAmount(cell(cells, columns.get("price"))));
        product.setStatus(parseStatus(cell(cells, columns.get("status"))));
        return product;
    }

    private static boolean rowHasData(String[] cells) {
        for (String cell : cells) {
            if (cell != null && !cell.isBlank()) return true;
        }
        return false;
    }

    private static String cell(String[] cells, Integer index) {
        if (index == null || index < 0 || index >= cells.length) return null;
        return cells[index];
    }

    private static BigDecimal parseAmount(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String value = raw.trim().replace("$", "").replace(",", "");
        try {
            return new BigDecimal(value);
        } catch (NumberFormatException e) {
            throw new BusinessException("Invalid amount: " + raw);
        }
    }

    private static String parseStatus(String raw) {
        if (raw == null || raw.isBlank()) return "ACTIVE";
        return raw.trim().toUpperCase(Locale.ROOT);
    }
}
