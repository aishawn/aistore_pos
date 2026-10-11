package com.orithos.modules.customer;

import com.orithos.common.BusinessException;
import com.orithos.modules.customer.mapper.CustomerMapper;
import com.orithos.modules.customer.mapper.CustomerRevisionMapper;
import com.orithos.modules.customerpayment.CustomerPayment;
import com.orithos.modules.customerpayment.CustomerPaymentMapper;
import com.orithos.security.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@Service
public class CustomerRevisionService {

    private final CustomerRevisionMapper revisionMapper;

    public CustomerRevisionService(CustomerRevisionMapper revisionMapper) {
        this.revisionMapper = revisionMapper;
    }

    public List<CustomerRevision> list(Long customerId, int page, int size) {
        int offset = Math.max(0, (page - 1) * size);
        return revisionMapper.page(customerId, size, offset);
    }

    public long count(Long customerId) {
        return revisionMapper.count(customerId);
    }

    public void logCreated(Long customerId) {
        insert(customerId, "CREATED", null, null, null, "Customer created");
    }

    public void logUpdated(CustomerDetail before, CustomerDetail after) {
        List<String> changed = new ArrayList<>();
        trackChange(changed, "First Name", before.getFirstName(), after.getFirstName());
        trackChange(changed, "Last Name", before.getLastName(), after.getLastName());
        trackChange(changed, "Company", before.getCompany(), after.getCompany());
        trackChange(changed, "Code", before.getCode(), after.getCode());
        trackChange(changed, "Email", before.getEmail(), after.getEmail());
        trackChange(changed, "Phone", before.getPhone(), after.getPhone());
        trackChange(changed, "Mobile", before.getMobile(), after.getMobile());
        trackChange(changed, "Customer Group", before.getCustomerGroupName(), after.getCustomerGroupName());
        trackChange(changed, "Account Limit", formatDecimal(before.getAccountLimit()), formatDecimal(after.getAccountLimit()));
        trackChange(changed, "Invoice Message", before.getInvoiceMessage(), after.getInvoiceMessage());
        trackChange(changed, "Comments", before.getComments(), after.getComments());
        if (changed.isEmpty()) return;
        insert(after.getId(), "UPDATED", null, null, null, "Updated " + String.join(", ", changed));
    }

    public void logPayment(Long customerId, CustomerPayment payment) {
        String summary = "Payment of $" + formatDecimal(payment.getAmount());
        if (payment.getReference() != null && !payment.getReference().isBlank()) {
            summary += " (" + payment.getReference().trim() + ")";
        }
        insert(customerId, "PAYMENT", null, null, null, summary);
    }

    public void logPaymentVoided(Long customerId, CustomerPayment payment) {
        insert(customerId, "PAYMENT_VOIDED", null, null, null,
                "Voided payment of $" + formatDecimal(payment.getAmount()));
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
        if (value == null) return "0.00";
        return value.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString();
    }

    private void insert(Long customerId, String action, String fieldName, String oldValue, String newValue, String summary) {
        CustomerRevision revision = new CustomerRevision();
        revision.setCustomerId(customerId);
        revision.setUserId(CurrentUser.id());
        revision.setAction(action);
        revision.setFieldName(fieldName);
        revision.setOldValue(oldValue);
        revision.setNewValue(newValue);
        revision.setSummary(summary);
        revisionMapper.insert(revision);
    }
}
