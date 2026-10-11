package com.orithos.modules.giftcard;

import com.orithos.common.BusinessException;
import com.orithos.common.ExcelUtils;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class GiftCardImportService {

    private static final String[] TEMPLATE_HEADERS = {
            "Code", "Amount", "Current Amount", "Expiry", "Status", "Outlet ID"
    };

    private static final boolean[] TEMPLATE_REQUIRED = {
            true, true, false, false, false, false
    };

    private static final Set<String> VALID_STATUSES = Set.of("ACTIVE", "REDEEMED", "EXPIRED", "INACTIVE");

    private static final DateTimeFormatter[] DATE_ONLY_FORMATS = {
            DateTimeFormatter.ISO_LOCAL_DATE,
            DateTimeFormatter.ofPattern("d/M/yyyy"),
            DateTimeFormatter.ofPattern("M/d/yyyy"),
            DateTimeFormatter.ofPattern("yyyy/M/d"),
            DateTimeFormatter.ofPattern("d/M/yy"),
            DateTimeFormatter.ofPattern("M/d/yy"),
    };

    private static final DateTimeFormatter[] DATE_TIME_FORMATS = {
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"),
            DateTimeFormatter.ISO_LOCAL_DATE_TIME,
    };

    private final GiftCardMapper mapper;

    public GiftCardImportService(GiftCardMapper mapper) {
        this.mapper = mapper;
    }

    public byte[] importTemplateXlsx() throws IOException {
        return ExcelUtils.writeXlsx("Gift Cards", TEMPLATE_HEADERS, TEMPLATE_REQUIRED,
                new String[]{"1001", "100", "100", "2026-12-31", "ACTIVE", ""});
    }

    public GiftCardImportResult importCsv(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new BusinessException("Please select a file to import.");
        }

        List<String[]> rows = ExcelUtils.parseSpreadsheet(file);
        if (rows.isEmpty()) {
            throw new BusinessException("The import file is empty.");
        }

        String[] headers = rows.getFirst();
        Map<String, Integer> columnIndex = mapHeaders(headers);
        if (!columnIndex.containsKey("code")) {
            throw new BusinessException("File must include a Code column.");
        }
        if (!columnIndex.containsKey("amount")) {
            throw new BusinessException("File must include an Amount column.");
        }

        int imported = 0;
        int skipped = 0;
        List<GiftCardImportError> errors = new ArrayList<>();

        for (int i = 1; i < rows.size(); i++) {
            String[] cells = rows.get(i);
            int rowNum = i + 1;
            try {
                GiftCard card = toGiftCard(cells, columnIndex);
                if (card == null) {
                    skipped++;
                    continue;
                }
                if (mapper.findByCode(card.getCode()) != null) {
                    throw new BusinessException("Gift card code already exists: " + card.getCode());
                }
                mapper.insert(card);
                imported++;
            } catch (BusinessException e) {
                errors.add(new GiftCardImportError(rowNum, e.getMessage()));
            } catch (Exception e) {
                errors.add(new GiftCardImportError(rowNum, e.getMessage() != null ? e.getMessage() : "Import failed"));
            }
        }

        if (imported == 0 && errors.isEmpty() && skipped > 0) {
            throw new BusinessException("No gift card rows found in the import file.");
        }
        if (imported == 0 && !errors.isEmpty()) {
            throw new BusinessException(formatErrorSummary(errors));
        }

        return new GiftCardImportResult(imported, skipped, errors);
    }

    private static String formatErrorSummary(List<GiftCardImportError> errors) {
        GiftCardImportError first = errors.getFirst();
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
                .replaceAll("\\s*\\*\\s*$", "")
                .replace("(required)", "")
                .replace("(optional)", "")
                .trim()
                .replace("original amount", "amount")
                .replace("gift card code", "code")
                .replace("card code", "code")
                .replace("current balance", "currentamount")
                .replace("current amount", "currentamount")
                .replace("balance", "currentamount")
                .replace("expiration", "expiry")
                .replace("expires", "expiry")
                .replace("outlet id", "outletid")
                .replace("outlet", "outletid");
    }

    private GiftCard toGiftCard(String[] cells, Map<String, Integer> columns) {
        String code = cell(cells, columns.get("code"));
        if (code == null || code.isBlank()) {
            if (rowHasData(cells)) {
                throw new BusinessException("Code is required.");
            }
            return null;
        }

        BigDecimal amount = parseAmount(cell(cells, columns.get("amount")));
        if (amount == null) {
            throw new BusinessException("Amount is required.");
        }

        String currentRaw = cell(cells, columns.get("currentamount"));
        BigDecimal currentAmount = currentRaw != null && !currentRaw.isBlank()
                ? parseAmount(currentRaw)
                : amount;
        if (currentAmount == null) {
            throw new BusinessException("Invalid current amount.");
        }

        GiftCard card = new GiftCard();
        card.setCode(code.trim());
        card.setOriginalAmount(amount);
        card.setCurrentAmount(currentAmount);
        card.setExpiry(parseDateTime(cell(cells, columns.get("expiry"))));
        card.setStatus(parseStatus(cell(cells, columns.get("status"))));
        card.setOutletId(parseLong(cell(cells, columns.get("outletid"))));
        return card;
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

    private static LocalDateTime parseDateTime(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String value = raw.trim();
        for (DateTimeFormatter fmt : DATE_ONLY_FORMATS) {
            try {
                return LocalDate.parse(value, fmt).atStartOfDay();
            } catch (DateTimeParseException ignored) {
                // try next format
            }
        }
        for (DateTimeFormatter fmt : DATE_TIME_FORMATS) {
            try {
                return LocalDateTime.parse(value, fmt);
            } catch (DateTimeParseException ignored) {
                // try next format
            }
        }
        throw new BusinessException("Invalid expiry: " + value + ". Use a date like 2026-12-31 or leave blank.");
    }

    private static String parseStatus(String raw) {
        if (raw == null || raw.isBlank()) return "ACTIVE";
        String value = raw.trim().toUpperCase(Locale.ROOT);
        if (!VALID_STATUSES.contains(value)) {
            throw new BusinessException("Invalid status: " + raw);
        }
        return value;
    }

    private static Long parseLong(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return Long.parseLong(raw.trim());
        } catch (NumberFormatException e) {
            throw new BusinessException("Invalid outlet ID: " + raw);
        }
    }
}
