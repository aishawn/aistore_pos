package com.orithos.modules.customer;

import com.orithos.modules.customer.mapper.CustomerGroupRevisionMapper;
import com.orithos.security.CurrentUser;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@Service
public class CustomerGroupRevisionService {

    private final CustomerGroupRevisionMapper revisionMapper;

    public CustomerGroupRevisionService(CustomerGroupRevisionMapper revisionMapper) {
        this.revisionMapper = revisionMapper;
    }

    public List<CustomerGroupRevision> list(Long customerGroupId, int page, int size) {
        int offset = Math.max(0, (page - 1) * size);
        return revisionMapper.page(customerGroupId, size, offset);
    }

    public long count(Long customerGroupId) {
        return revisionMapper.count(customerGroupId);
    }

    public void logCreated(Long customerGroupId) {
        insert(customerGroupId, "CREATED", null, null, null, "Customer group created");
    }

    public void logUpdated(CustomerGroup before, CustomerGroup after) {
        List<String> changed = new ArrayList<>();
        trackChange(changed, "Name", before.getName(), after.getName());
        trackChange(changed, "Default Receipt", before.getDefaultReceiptId(), after.getDefaultReceiptId());
        trackChange(changed, "Email Receipt", before.getEmailReceiptId(), after.getEmailReceiptId());
        trackChange(changed, "Payment Receipt", before.getPaymentReceiptId(), after.getPaymentReceiptId());
        trackChange(changed, "Statement Template", before.getStatementTemplateId(), after.getStatementTemplateId());
        trackChange(changed, "Price List", before.getPriceListId(), after.getPriceListId());
        trackChange(changed, "Loyalty Enabled", before.getLoyaltyEnabled(), after.getLoyaltyEnabled());
        trackChange(changed, "Disable Promotions", before.getDisablePromotions(), after.getDisablePromotions());
        trackChange(changed, "Allow Account Sales", before.getAllowAccountSales(), after.getAllowAccountSales());
        trackChange(changed, "Account Limit", formatDecimal(before.getAccountLimit()), formatDecimal(after.getAccountLimit()));
        trackChange(changed, "Auto Print Receipt", before.getAutoPrintReceipt(), after.getAutoPrintReceipt());
        trackChange(changed, "Auto Print Parked Receipt", before.getAutoPrintParkedReceipt(), after.getAutoPrintParkedReceipt());
        trackChange(changed, "Auto Email Receipt", before.getAutoEmailReceipt(), after.getAutoEmailReceipt());
        trackChange(changed, "Auto Print Payment Receipt", before.getAutoPrintPaymentReceipt(), after.getAutoPrintPaymentReceipt());
        trackChange(changed, "Require Order Reference", before.getRequireOrderReference(), after.getRequireOrderReference());
        trackChange(changed, "Credit Terms", before.getCreditTerms(), after.getCreditTerms());
        if (changed.isEmpty()) return;
        insert(after.getId(), "UPDATED", null, null, null, "Updated " + String.join(", ", changed));
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

    private void insert(Long customerGroupId, String action, String fieldName, String oldValue, String newValue, String summary) {
        CustomerGroupRevision revision = new CustomerGroupRevision();
        revision.setCustomerGroupId(customerGroupId);
        revision.setUserId(CurrentUser.id());
        revision.setAction(action);
        revision.setFieldName(fieldName);
        revision.setOldValue(oldValue);
        revision.setNewValue(newValue);
        revision.setSummary(summary);
        revisionMapper.insert(revision);
    }
}
