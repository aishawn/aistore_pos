package com.orithos.modules.product;

import com.orithos.modules.product.mapper.ProductRevisionMapper;
import com.orithos.security.CurrentUser;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@Service
public class ProductRevisionService {

    private final ProductRevisionMapper revisionMapper;

    public ProductRevisionService(ProductRevisionMapper revisionMapper) {
        this.revisionMapper = revisionMapper;
    }

    public List<ProductRevision> list(Long productId, int page, int size) {
        int offset = Math.max(0, (page - 1) * size);
        return revisionMapper.page(productId, size, offset);
    }

    public long count(Long productId) {
        return revisionMapper.count(productId);
    }

    public void logCreated(Long productId) {
        insert(productId, "CREATED", null, null, null, "Product created");
    }

    public void logUpdated(Product before, Product after) {
        if (before == null || after == null) return;
        List<String> changed = new ArrayList<>();
        trackChange(changed, "Name", before.getName(), after.getName());
        trackChange(changed, "Status", before.getStatus(), after.getStatus());
        trackChange(changed, "Description", before.getDescription(), after.getDescription());
        trackChange(changed, "Type", before.getType(), after.getType());
        trackChange(changed, "Category", before.getCategoryName(), after.getCategoryName());
        trackChange(changed, "Brand", before.getBrandName(), after.getBrandName());
        trackChange(changed, "Family", before.getFamilyId(), after.getFamilyId());
        trackChange(changed, "Tax Rate", before.getTaxRateId(), after.getTaxRateId());
        trackChange(changed, "Cost Tax Rate", before.getCostTaxRateId(), after.getCostTaxRateId());
        trackChange(changed, "Cost", formatDecimal(before.getCost()), formatDecimal(after.getCost()));
        trackChange(changed, "Price", formatDecimal(before.getPrice()), formatDecimal(after.getPrice()));
        trackChange(changed, "Case Quantity", formatDecimal(before.getCaseQuantity()), formatDecimal(after.getCaseQuantity()));
        trackChange(changed, "ABV", formatDecimal(before.getAbv()), formatDecimal(after.getAbv()));
        trackChange(changed, "Volume", before.getVolumeMl(), after.getVolumeMl());
        trackChange(changed, "Region", before.getRegion(), after.getRegion());
        trackChange(changed, "Vintage", before.getVintage(), after.getVintage());
        trackChange(changed, "Track Inventory", before.getTrackInventory(), after.getTrackInventory());
        trackChange(changed, "Show Shortcuts", before.getShowShortcuts(), after.getShowShortcuts());
        trackChange(changed, "Prevent Manual Discounts", before.getPreventManualDiscounts(), after.getPreventManualDiscounts());
        trackChange(changed, "Request Price", before.getRequestPrice(), after.getRequestPrice());
        trackChange(changed, "Request Quantity", before.getRequestQuantity(), after.getRequestQuantity());
        trackChange(changed, "Cost Percentage", before.getCostPercentage(), after.getCostPercentage());
        if (changed.isEmpty()) return;
        insert(after.getId(), "UPDATED", null, null, null, "Updated " + String.join(", ", changed));
    }

    public void logDeactivated(Long productId) {
        insert(productId, "DEACTIVATED", "Status", "ACTIVE", "INACTIVE", "Product deactivated");
    }

    public void logDeleted(Long productId) {
        insert(productId, "DELETED", null, null, null, "Product deleted");
    }

    private void trackChange(List<String> changed, String label, Object before, Object after) {
        if (!Objects.equals(normalize(before), normalize(after))) {
            changed.add(label);
        }
    }

    private static String normalize(Object value) {
        if (value == null) return "";
        return String.valueOf(value).trim();
    }

    private static String formatDecimal(BigDecimal value) {
        if (value == null) return "";
        return value.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString();
    }

    private void insert(Long productId, String action, String fieldName, String oldValue, String newValue, String summary) {
        ProductRevision revision = new ProductRevision();
        revision.setProductId(productId);
        revision.setUserId(CurrentUser.id());
        revision.setAction(action);
        revision.setFieldName(fieldName);
        revision.setOldValue(oldValue);
        revision.setNewValue(newValue);
        revision.setSummary(summary);
        revisionMapper.insert(revision);
    }
}
