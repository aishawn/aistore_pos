package com.orithos.modules.customer;

import com.orithos.common.BusinessException;
import com.orithos.common.SqlConstraintUtils;
import com.orithos.modules.customer.mapper.CustomerGroupMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CustomerGroupService {

    public static final int DUPLICATE_NAME_CODE = 40906;
    public static final String DEFAULT_GROUP_NAME = "default";
    private static final String LEGACY_DEFAULT_GROUP_NAME = "默认分组";

    private final CustomerGroupMapper groupMapper;
    private final CustomerGroupRevisionService groupRevisionService;

    public CustomerGroupService(CustomerGroupMapper groupMapper,
                                CustomerGroupRevisionService groupRevisionService) {
        this.groupMapper = groupMapper;
        this.groupRevisionService = groupRevisionService;
    }

    /** Find or create the system default customer group used when none is selected. */
    @Transactional
    public CustomerGroup ensureDefaultGroup() {
        CustomerGroup existing = groupMapper.findActiveByName(DEFAULT_GROUP_NAME);
        if (existing != null) {
            return existing;
        }
        CustomerGroup legacy = groupMapper.findActiveByName(LEGACY_DEFAULT_GROUP_NAME);
        if (legacy != null) {
            CustomerGroup before = groupMapper.findById(legacy.getId());
            legacy.setName(DEFAULT_GROUP_NAME);
            groupMapper.update(legacy);
            if (before != null) {
                groupRevisionService.logUpdated(before, legacy);
            }
            return legacy;
        }
        CustomerGroup created = new CustomerGroup();
        created.setName(DEFAULT_GROUP_NAME);
        applyGroupDefaults(created);
        try {
            groupMapper.insert(created);
        } catch (RuntimeException e) {
            CustomerGroup raced = groupMapper.findActiveByName(DEFAULT_GROUP_NAME);
            if (raced != null) {
                return raced;
            }
            throw constraintOrRethrow(e);
        }
        if (created.getId() != null) {
            groupRevisionService.logCreated(created.getId());
        }
        return created;
    }

    public void ensureUniqueActiveName(String name, Long excludeId) {
        if (name == null || name.isBlank()) {
            throw new BusinessException("Customer group name is required.");
        }
        String trimmed = name.trim();
        long count = excludeId == null
                ? groupMapper.countActiveByName(trimmed)
                : groupMapper.countActiveByNameExcluding(trimmed, excludeId);
        if (count > 0) {
            throw new BusinessException(
                    DUPLICATE_NAME_CODE,
                    "Customer group name is already in use. Please choose another name.");
        }
    }

    @Transactional
    public CustomerGroup create(CustomerGroup g) {
        applyGroupDefaults(g);
        ensureUniqueActiveName(g.getName(), null);
        try {
            groupMapper.insert(g);
        } catch (RuntimeException e) {
            throw constraintOrRethrow(e);
        }
        groupRevisionService.logCreated(g.getId());
        return g;
    }

    @Transactional
    public CustomerGroup update(Long id, CustomerGroup g) {
        CustomerGroup before = groupMapper.findById(id);
        g.setId(id);
        applyGroupDefaults(g);
        if (g.getName() != null) {
            ensureUniqueActiveName(g.getName(), id);
        }
        try {
            groupMapper.update(g);
        } catch (RuntimeException e) {
            throw constraintOrRethrow(e);
        }
        if (before != null) {
            groupRevisionService.logUpdated(before, g);
        }
        return g;
    }

    private static void applyGroupDefaults(CustomerGroup g) {
        if (g.getLoyaltyEnabled() == null) g.setLoyaltyEnabled(false);
        if (g.getDisablePromotions() == null) g.setDisablePromotions(false);
        if (g.getAllowAccountSales() == null) g.setAllowAccountSales(false);
        if (g.getAutoPrintReceipt() == null) g.setAutoPrintReceipt(false);
        if (g.getAutoPrintParkedReceipt() == null) g.setAutoPrintParkedReceipt(false);
        if (g.getAutoEmailReceipt() == null) g.setAutoEmailReceipt(false);
        if (g.getAutoPrintPaymentReceipt() == null) g.setAutoPrintPaymentReceipt(false);
        if (g.getRequireOrderReference() == null) g.setRequireOrderReference(false);
    }

    private RuntimeException constraintOrRethrow(RuntimeException e) {
        if (SqlConstraintUtils.isDuplicateCustomerGroupName(e)) {
            return new BusinessException(
                    DUPLICATE_NAME_CODE,
                    "Customer group name is already in use. Please choose another name.");
        }
        return e;
    }
}
