package com.orithos.modules.ai.command;

import com.orithos.modules.customer.mapper.CustomerMapper;
import com.orithos.modules.product.Product;
import com.orithos.modules.product.ProductBarcode;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.modules.ai.report.OdooReportQueryService;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Resolves model-provided names against local business data. Model supplied
 * ids and current values are treated as hints only; this service is the sole
 * source of preview targets and before-values.
 */
@Service
public class AiCommandTargetResolver {
    private final ProductMapper products;
    private final CustomerMapper customers;
    private final JdbcTemplate jdbc;
    private final OdooReportQueryService odooReports;

    public AiCommandTargetResolver(ProductMapper products, CustomerMapper customers, JdbcTemplate jdbc) {
        this(products, customers, jdbc, null);
    }

    @Autowired
    public AiCommandTargetResolver(ProductMapper products, CustomerMapper customers, JdbcTemplate jdbc,
                                   OdooReportQueryService odooReports) {
        this.products = products;
        this.customers = customers;
        this.jdbc = jdbc;
        this.odooReports = odooReports;
    }

    public Resolution resolve(AiCommandType type, List<AiCommandDtos.ParsedItem> parsedItems) {
        return resolve(null, type, parsedItems);
    }

    public Resolution resolve(TenantContext tenant, AiCommandType type,
                              List<AiCommandDtos.ParsedItem> parsedItems) {
        List<AiCommandDtos.CommandItem> resolved = new ArrayList<>();
        List<AiCommandDtos.CommandItem> excluded = new ArrayList<>();
        if (parsedItems == null) return new Resolution(resolved, excluded);
        for (AiCommandDtos.ParsedItem item : parsedItems) {
            if (item == null) continue;
            if (odooReports != null && tenant != null
                    && (type == AiCommandType.UPDATE_PRODUCT || type == AiCommandType.PREVIEW_PRICE_CHANGE)) {
                resolveOdooProduct(tenant, type, item, resolved, excluded);
            } else if (type == AiCommandType.UPDATE_PRODUCT) {
                resolveProduct(item, resolved, excluded);
            } else if (type == AiCommandType.UPDATE_CUSTOMER) {
                resolveCustomer(item, resolved, excluded);
            } else {
                excluded.add(excluded(item, "This command type has no local preview resolver yet"));
            }
        }
        return new Resolution(List.copyOf(resolved), List.copyOf(excluded));
    }

    private void resolveOdooProduct(TenantContext tenant, AiCommandType type,
                                   AiCommandDtos.ParsedItem item,
                                   List<AiCommandDtos.CommandItem> resolved,
                                   List<AiCommandDtos.CommandItem> excluded) {
        OdooReportQueryService.ProductSearchResult result = odooReports.searchProducts(tenant, item.name(), 8);
        if (result.error() != null) {
            excluded.add(excluded(item, "Odoo product source unavailable: " + result.error()));
            return;
        }
        if (result.rows().size() != 1) {
            excluded.add(excluded(item, result.rows().isEmpty()
                    ? "No unique Odoo product matched the requested name or barcode"
                    : "Multiple Odoo products matched; clarification is required"));
            return;
        }
        Map<String, Object> row = result.rows().get(0);
        Object rawId = row.get("id");
        if (!(rawId instanceof Number number) || number.longValue() <= 0) {
            excluded.add(excluded(item, "Odoo product has no valid record ID"));
            return;
        }
        long id = number.longValue();
        String name = String.valueOf(row.getOrDefault("name", item.name()));
        Object before = type == AiCommandType.PREVIEW_PRICE_CHANGE
                ? row.get("list_price") : name;
        resolved.add(new AiCommandDtos.CommandItem(id, name,
                type == AiCommandType.PREVIEW_PRICE_CHANGE ? "price" : item.field(), before,
                item.after(), item.evidence(), null, "odoo:" + id));
    }

    private void resolveProduct(AiCommandDtos.ParsedItem item,
                                List<AiCommandDtos.CommandItem> resolved,
                                List<AiCommandDtos.CommandItem> excluded) {
        Product product = null;
        if (item.id() != null && item.id() > 0) {
            product = products.findById(item.id());
        } else if (isBarcode(item.name())) {
            Long id = products.findProductIdByBarcode(item.name().trim());
            if (id != null) product = products.findById(id);
        } else if (products.countActiveByName(item.name().trim()) == 1) {
            product = products.findActiveByName(item.name().trim());
        }
        if (product == null) {
            String reason = products.countActiveByName(item.name().trim()) > 1
                    ? "Multiple products matched; clarification is required"
                    : "No unique product matched the requested name or barcode";
            excluded.add(excluded(item, reason));
            return;
        }
        Object before = currentProductValue(product, item.field());
        if (before == null && "barcode".equals(item.field())) {
            List<ProductBarcode> barcodes = products.findBarcodesByProductId(product.getId());
            before = barcodes.isEmpty() ? null : barcodes.get(0).getCode();
        }
        resolved.add(new AiCommandDtos.CommandItem(product.getId(), product.getName(), item.field(),
                before, item.after(), item.evidence(), null, sourceVersion(product)));
    }

    private void resolveCustomer(AiCommandDtos.ParsedItem item,
                                 List<AiCommandDtos.CommandItem> resolved,
                                 List<AiCommandDtos.CommandItem> excluded) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT id, name, email, phone, mobile,
                       COALESCE(updated_at, created_at) AS source_version
                FROM customer
                WHERE deleted_at IS NULL
                  AND (LOWER(TRIM(name)) = LOWER(TRIM(?))
                    OR LOWER(TRIM(COALESCE(email, ''))) = LOWER(TRIM(?))
                    OR TRIM(COALESCE(phone, '')) = TRIM(?)
                    OR TRIM(COALESCE(mobile, '')) = TRIM(?))
                ORDER BY id
                LIMIT 21
                """, item.name(), item.name(), item.name(), item.name());
        if (rows.size() != 1) {
            excluded.add(excluded(item, rows.isEmpty()
                    ? "No unique customer matched the requested name, email or phone"
                    : "Multiple customers matched; clarification is required"));
            return;
        }
        Map<String, Object> row = rows.get(0);
        Long id = ((Number) row.get("id")).longValue();
        Object before = row.get(fieldColumn(item.field()));
        resolved.add(new AiCommandDtos.CommandItem(id,
                String.valueOf(row.getOrDefault("name", item.name())), item.field(), before,
                item.after(), item.evidence(), null,
                String.valueOf(row.getOrDefault("source_version", "customer:" + id))));
    }

    private static Object currentProductValue(Product product, String field) {
        return switch (field) {
            case "displayName" -> product.getName();
            case "category" -> product.getCategoryName() != null
                    ? product.getCategoryName() : product.getCategoryId();
            case "tags" -> product.getTagIds();
            case "barcode" -> null;
            default -> null;
        };
    }

    private static String fieldColumn(String field) {
        return switch (field) {
            case "name" -> "name";
            case "email" -> "email";
            case "phone" -> "phone";
            case "address" -> "delivery_contact_id";
            case "group" -> "customer_group_id";
            default -> "name";
        };
    }

    private static String sourceVersion(Product product) {
        return product.getCreatedAt() == null
                ? "product:" + product.getId()
                : "product:" + product.getId() + ":" + product.getCreatedAt();
    }

    private static AiCommandDtos.CommandItem excluded(AiCommandDtos.ParsedItem item, String reason) {
        return new AiCommandDtos.CommandItem(item.id(), item.name(), item.field(), null, item.after(),
                item.evidence(), reason, null);
    }

    private static boolean isBarcode(String value) {
        if (value == null) return false;
        String normalized = value.trim();
        return normalized.length() >= 6 && normalized.chars().allMatch(Character::isDigit);
    }

    public record Resolution(List<AiCommandDtos.CommandItem> items,
                             List<AiCommandDtos.CommandItem> excludedItems) { }
}
