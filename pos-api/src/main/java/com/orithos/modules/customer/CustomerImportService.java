package com.orithos.modules.customer;

import com.orithos.common.BusinessException;
import com.orithos.common.ExcelUtils;
import com.orithos.modules.customer.mapper.CustomerEmailMapper;
import com.orithos.modules.customer.mapper.CustomerMapper;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import com.orithos.security.CurrentUser;

@Service
public class CustomerImportService {

    private static final String[] TEMPLATE_HEADERS = {
            "Name",
            "Company",
            "Code",
            "Birthday",
            "Email Addresses",
            "Phone Number",
            "Subscribed to Marketing Emails",
    };

    private static final DateTimeFormatter[] DATE_FORMATS = {
            DateTimeFormatter.ISO_LOCAL_DATE,
            DateTimeFormatter.ofPattern("d/M/yyyy"),
            DateTimeFormatter.ofPattern("M/d/yyyy"),
            DateTimeFormatter.ofPattern("yyyy/M/d"),
            DateTimeFormatter.ofPattern("d/M/yy"),
            DateTimeFormatter.ofPattern("M/d/yy"),
    };

    private final CustomerMapper customerMapper;
    private final CustomerEmailMapper customerEmailMapper;

    public CustomerImportService(CustomerMapper customerMapper,
                                 CustomerEmailMapper customerEmailMapper) {
        this.customerMapper = customerMapper;
        this.customerEmailMapper = customerEmailMapper;
    }

    public byte[] importTemplateXlsx() throws IOException {
        return ExcelUtils.writeXlsx("Customers", TEMPLATE_HEADERS,
                new String[]{"John Smith", "Acme Pty Ltd", "C001", "9/2/1989", "john@example.com", "0412345678", "Yes"});
    }

    public CustomerImportResult importCsv(MultipartFile file) throws IOException {
        Long outletId = CurrentUser.outletId();
        if (outletId == null) throw new BusinessException(40100, "Authenticated outlet is required.");
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
        List<CustomerImportError> errors = new ArrayList<>();

        for (int i = 1; i < rows.size(); i++) {
            String[] cells = rows.get(i);
            int rowNum = i + 1;
            try {
                Customer customer = toCustomer(cells, columnIndex);
                if (customer == null) {
                    skipped++;
                    continue;
                }
                customer.setOutletId(outletId);
                customerMapper.insert(customer);
                imported++;
            } catch (BusinessException e) {
                errors.add(new CustomerImportError(rowNum, e.getMessage()));
            } catch (Exception e) {
                errors.add(new CustomerImportError(rowNum, e.getMessage() != null ? e.getMessage() : "Import failed"));
            }
        }

        if (imported == 0 && errors.isEmpty() && skipped > 0) {
            throw new BusinessException("No customer rows found in the import file.");
        }
        if (imported == 0 && !errors.isEmpty()) {
            throw new BusinessException(formatErrorSummary(errors));
        }

        return new CustomerImportResult(imported, skipped, errors);
    }

    private static String formatErrorSummary(List<CustomerImportError> errors) {
        CustomerImportError first = errors.getFirst();
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
                .replace("email addresses", "email")
                .replace("email address", "email")
                .replace("phone number", "phone")
                .replace("subscribed to marketing emails", "marketing")
                .replace("marketing emails", "marketing");
    }

    private Customer toCustomer(String[] cells, Map<String, Integer> columns) {
        String name = cell(cells, columns.get("name"));
        if (name == null || name.isBlank()) {
            if (rowHasData(cells)) {
                throw new BusinessException("Name is required.");
            }
            return null;
        }

        Customer c = new Customer();
        c.setName(name.trim());
        c.setCompany(trimOrNull(cell(cells, columns.get("company"))));
        c.setCode(trimOrNull(cell(cells, columns.get("code"))));
        c.setEmail(trimOrNull(cell(cells, columns.get("email"))));
        if (c.getEmail() != null
                && customerEmailMapper.countActiveByEmailExcludingCustomer(c.getEmail(), null, CurrentUser.outletId()) > 0) {
            throw new BusinessException("A customer with this email already exists.");
        }
        c.setPhone(trimOrNull(cell(cells, columns.get("phone"))));
        c.setBirthday(parseDate(cell(cells, columns.get("birthday"))));
        c.setAllowMarketingEmails(parseMarketing(cell(cells, columns.get("marketing"))));
        c.setLoyaltyEnabled(false);
        c.setLoyaltyPoints(BigDecimal.ZERO);
        c.setCurrentOwing(BigDecimal.ZERO);
        return c;
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

    private static String trimOrNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static LocalDate parseDate(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String value = raw.trim();
        for (DateTimeFormatter fmt : DATE_FORMATS) {
            try {
                return LocalDate.parse(value, fmt);
            } catch (DateTimeParseException ignored) {
                // try next format
            }
        }
        throw new BusinessException("Invalid birthday: " + value);
    }

    private static Boolean parseMarketing(String raw) {
        if (raw == null || raw.isBlank()) return true;
        String value = raw.trim().toLowerCase(Locale.ROOT);
        return switch (value) {
            case "yes", "y", "true", "1", "opted in", "opted_in", "opt-in", "opt in" -> true;
            case "no", "n", "false", "0", "opted out", "opted_out", "opt-out", "opt out" -> false;
            default -> true;
        };
    }
}
