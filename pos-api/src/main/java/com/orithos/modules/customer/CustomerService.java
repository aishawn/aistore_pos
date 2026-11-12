package com.orithos.modules.customer;

import com.orithos.common.BusinessException;
import com.orithos.common.CustomerValidationUtils;
import com.orithos.common.PageResult;
import com.orithos.common.SqlConstraintUtils;
import com.orithos.modules.customer.mapper.ContactMapper;
import com.orithos.modules.customer.mapper.CustomerEmailMapper;
import com.orithos.modules.customer.mapper.CustomerMapper;
import com.orithos.modules.sale.SaleMapper;
import com.orithos.security.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

@Service
public class CustomerService {

    public static final int DUPLICATE_CODE = 40904;
    public static final int DUPLICATE_EMAIL = 40905;
    static final ZoneId STORE_ZONE = ZoneId.of("Australia/Adelaide");
    static final int PERFORMANCE_DAYS = 30;

    private final CustomerMapper customerMapper;
    private final ContactMapper contactMapper;
    private final CustomerEmailMapper customerEmailMapper;
    private final CustomerRevisionService revisionService;
    private final SaleMapper saleMapper;
    private final CustomerGroupService customerGroupService;

    public CustomerService(CustomerMapper customerMapper,
                           ContactMapper contactMapper,
                           CustomerEmailMapper customerEmailMapper,
                           CustomerRevisionService revisionService,
                           SaleMapper saleMapper,
                           CustomerGroupService customerGroupService) {
        this.customerMapper = customerMapper;
        this.contactMapper = contactMapper;
        this.customerEmailMapper = customerEmailMapper;
        this.revisionService = revisionService;
        this.saleMapper = saleMapper;
        this.customerGroupService = customerGroupService;
    }

    public PageResult<Customer> list(String name,
                                     List<Long> groupIds,
                                     boolean includeNoGroup,
                                     boolean filterGroups,
                                     Long priceListId,
                                     boolean noPriceList,
                                     boolean filterPriceList,
                                     BigDecimal minOwing,
                                     BigDecimal maxOwing,
                                     LocalDateTime asOfEnd,
                                     int page,
                                     int size) {
        Long outletId = requireCurrentOutlet();
        int offset = Math.max(0, (page - 1) * size);
        List<Customer> items = customerMapper.page(name, groupIds, includeNoGroup, filterGroups,
                priceListId, noPriceList, filterPriceList, minOwing, maxOwing, asOfEnd, outletId, size, offset);
        attachPerformance(items, LocalDate.now(STORE_ZONE));
        return PageResult.of(items,
                customerMapper.count(name, groupIds, includeNoGroup, filterGroups,
                        priceListId, noPriceList, filterPriceList, minOwing, maxOwing, asOfEnd, outletId),
                page, size);
    }

    /** Fills {@code performance30d} (oldest to newest, ending today) with units sold per business day. */
    void attachPerformance(List<Customer> items, LocalDate today) {
        if (items == null || items.isEmpty()) return;
        LocalDate from = today.minusDays(PERFORMANCE_DAYS - 1L);
        List<Long> customerIds = items.stream().map(Customer::getId).toList();
        List<CustomerMapper.CustomerDailyQuantity> rows =
                customerMapper.salesQuantityByDay(customerIds, from.toString(), today.toString());
        Map<Long, List<Double>> seriesByCustomer = new HashMap<>();
        if (rows != null) {
            for (CustomerMapper.CustomerDailyQuantity row : rows) {
                if (row.getCustomerId() == null || row.getDay() == null) continue;
                long index = ChronoUnit.DAYS.between(from, row.getDay());
                if (index < 0 || index >= PERFORMANCE_DAYS) continue;
                BigDecimal quantity = row.getQuantity() == null ? BigDecimal.ZERO : row.getQuantity();
                List<Double> series = seriesByCustomer.computeIfAbsent(row.getCustomerId(), k -> emptyPerformance());
                series.set((int) index, series.get((int) index) + quantity.doubleValue());
            }
        }
        for (Customer item : items) {
            item.setPerformance30d(seriesByCustomer.getOrDefault(item.getId(), emptyPerformance()));
        }
    }

    private static List<Double> emptyPerformance() {
        List<Double> series = new ArrayList<>(PERFORMANCE_DAYS);
        for (int i = 0; i < PERFORMANCE_DAYS; i++) series.add(0.0d);
        return series;
    }

    public CustomerDetail getDetail(Long id) {
        ensureInCurrentOutlet(id);
        CustomerDetail detail = customerMapper.findDetailById(id);
        if (detail == null) {
            throw new BusinessException("Customer not found.");
        }
        attachEmails(detail);
        return detail;
    }

    public List<CustomerRecentSaleLine> getRecentSaleLines(Long id, int limit) {
        ensureInCurrentOutlet(id);
        if (customerMapper.findDetailById(id) == null) {
            throw new BusinessException("Customer not found.");
        }
        return saleMapper.recentLinesByCustomer(id, Math.min(Math.max(limit, 1), 50));
    }

    public List<CustomerRevision> getRevisions(Long id, int page, int size) {
        ensureInCurrentOutlet(id);
        if (customerMapper.findDetailById(id) == null) {
            throw new BusinessException("Customer not found.");
        }
        return revisionService.list(id, page, size);
    }

    public long getRevisionCount(Long id) {
        return revisionService.count(id);
    }

    @Transactional
    public CustomerDetail create(CustomerDetail input) {
        CustomerDetail detail = prepareForSave(input);
        detail.setOutletId(requireCurrentOutlet());
        if (detail.getCurrentOwing() == null) detail.setCurrentOwing(BigDecimal.ZERO);

        detail.setBillingContactId(upsertContact(null, billingContact(detail)));
        detail.setDeliveryContactId(upsertContact(null, deliveryContact(detail)));
        try {
            customerMapper.insertDetail(detail);
        } catch (RuntimeException e) {
            throw constraintOrRethrow(e);
        }
        try {
            saveEmails(detail.getId(), resolveEmails(input));
        } catch (RuntimeException e) {
            throw constraintOrRethrow(e);
        }
        CustomerDetail created = getDetail(detail.getId());
        revisionService.logCreated(created.getId());
        return created;
    }

    @Transactional
    public CustomerDetail update(Long id, CustomerDetail input) {
        ensureInCurrentOutlet(id);
        CustomerDetail existing = customerMapper.findDetailById(id);
        if (existing == null) {
            throw new BusinessException("Customer not found.");
        }

        CustomerDetail detail = prepareForSave(input);
        detail.setId(id);
        detail.setCurrentOwing(existing.getCurrentOwing());
        ensurePersistableDefaults(detail, existing);

        detail.setBillingContactId(upsertContact(existing.getBillingContactId(), billingContact(detail)));
        detail.setDeliveryContactId(upsertContact(existing.getDeliveryContactId(), deliveryContact(detail)));
        try {
            customerMapper.updateDetail(detail);
        } catch (RuntimeException e) {
            throw constraintOrRethrow(e);
        }
        try {
            saveEmails(id, resolveEmails(input));
        } catch (RuntimeException e) {
            throw constraintOrRethrow(e);
        }
        CustomerDetail updated = getDetail(id);
        revisionService.logUpdated(existing, updated);
        return updated;
    }

    private CustomerDetail prepareForSave(CustomerDetail input) {
        CustomerDetail detail = normalize(input);
        ensureUniqueActiveCode(detail.getCode(), detail.getId());
        ensureUniqueActiveEmails(resolveEmails(input), detail.getId());
        applyPersistableDefaults(detail);
        List<String> emails = resolveEmails(input);
        detail.setEmail(emails.isEmpty() ? null : emails.getFirst());
        return detail;
    }

    private void attachEmails(CustomerDetail detail) {
        List<String> emails = customerEmailMapper.findEmailsByCustomerId(detail.getId());
        if (emails.isEmpty() && detail.getEmail() != null && !detail.getEmail().isBlank()) {
            emails = List.of(detail.getEmail().trim());
        }
        detail.setEmails(emails);
        if (!emails.isEmpty()) {
            detail.setEmail(emails.getFirst());
        }
    }

    private void saveEmails(Long customerId, List<String> emails) {
        customerEmailMapper.deleteByCustomerId(customerId);
        int order = 0;
        Long outletId = requireCurrentOutlet();
        for (String email : emails) {
            customerEmailMapper.insert(customerId, email, order++, outletId);
        }
    }

    private static List<String> resolveEmails(CustomerDetail input) {
        List<String> fromList = normalizeEmails(input.getEmails());
        if (!fromList.isEmpty()) return fromList;
        if (input.getEmail() != null && !input.getEmail().isBlank()) {
            return List.of(input.getEmail().trim());
        }
        return List.of();
    }

    private static List<String> normalizeEmails(List<String> emails) {
        if (emails == null || emails.isEmpty()) return List.of();
        LinkedHashSet<String> unique = new LinkedHashSet<>();
        for (String email : emails) {
            String trimmed = CustomerValidationUtils.trimToNull(email);
            if (trimmed != null) unique.add(trimmed);
        }
        return new ArrayList<>(unique);
    }

    private static void applyPersistableDefaults(CustomerDetail detail) {
        if (detail.getLoyaltyEnabled() == null) detail.setLoyaltyEnabled(false);
        if (detail.getLoyaltyPoints() == null) detail.setLoyaltyPoints(BigDecimal.ZERO);
        if (detail.getDisablePromotions() == null) detail.setDisablePromotions(false);
        if (detail.getOverrideCustomerGroup() == null) detail.setOverrideCustomerGroup(false);
        if (detail.getAllowMarketingEmails() == null) detail.setAllowMarketingEmails(true);
    }

    /** Guard NOT NULL DB columns when optional JSON fields are absent. */
    private void ensurePersistableDefaults(CustomerDetail detail, CustomerDetail existing) {
        if (detail.getAllowMarketingEmails() == null) {
            detail.setAllowMarketingEmails(
                    existing.getAllowMarketingEmails() != null ? existing.getAllowMarketingEmails() : true);
        }
        if (detail.getOverrideCustomerGroup() == null) {
            detail.setOverrideCustomerGroup(
                    existing.getOverrideCustomerGroup() != null ? existing.getOverrideCustomerGroup() : false);
        }
        if (detail.getLoyaltyEnabled() == null) {
            detail.setLoyaltyEnabled(existing.getLoyaltyEnabled() != null ? existing.getLoyaltyEnabled() : false);
        }
        if (detail.getLoyaltyPoints() == null) {
            detail.setLoyaltyPoints(existing.getLoyaltyPoints() != null ? existing.getLoyaltyPoints() : BigDecimal.ZERO);
        }
        if (detail.getDisablePromotions() == null) {
            detail.setDisablePromotions(
                    existing.getDisablePromotions() != null ? existing.getDisablePromotions() : false);
        }
    }

    private CustomerDetail normalize(CustomerDetail detail) {
        CustomerValidationUtils.trimDetail(detail);

        CustomerValidationUtils.validateFirstName(detail.getFirstName());
        CustomerValidationUtils.validateLastName(detail.getLastName());
        if (detail.getCustomerGroupId() == null) {
            detail.setCustomerGroupId(customerGroupService.ensureDefaultGroup().getId());
        }
        if (detail.getCode() == null || detail.getCode().isBlank()) {
            detail.setCode(generateUniqueCode());
        }
        CustomerValidationUtils.validateCode(detail.getCode());

        List<String> emails = resolveEmails(detail);
        for (String email : emails) {
            CustomerValidationUtils.validateEmail(email);
        }

        CustomerValidationUtils.validateOptionalPhone(detail.getPhone(), "Phone");
        CustomerValidationUtils.validateOptionalPhone(detail.getMobile(), "Mobile");
        CustomerValidationUtils.validateOptionalPhone(detail.getFax(), "Fax");

        CustomerValidationUtils.validateOptionalMaxLength(detail.getCompany(), CustomerValidationUtils.COMPANY_MAX, "Company");
        CustomerValidationUtils.validateOptionalMaxLength(detail.getWebsite(), CustomerValidationUtils.URL_MAX, "Website");
        CustomerValidationUtils.validateOptionalMaxLength(detail.getTwitter(), CustomerValidationUtils.URL_MAX, "Twitter");
        CustomerValidationUtils.validateOptionalMaxLength(detail.getFacebook(), CustomerValidationUtils.URL_MAX, "Facebook");
        CustomerValidationUtils.validateOptionalMaxLength(
                detail.getBillingStreetAddress1(), CustomerValidationUtils.ADDRESS_STREET_MAX, "Street Address 1");
        CustomerValidationUtils.validateOptionalMaxLength(
                detail.getBillingStreetAddress2(), CustomerValidationUtils.ADDRESS_STREET_MAX, "Street Address 2");
        CustomerValidationUtils.validateOptionalMaxLength(
                detail.getBillingSuburb(), CustomerValidationUtils.ADDRESS_SUBURB_MAX, "Suburb");
        CustomerValidationUtils.validateOptionalMaxLength(
                detail.getBillingPostCode(), CustomerValidationUtils.ADDRESS_POSTCODE_MAX, "Postcode / ZIP Code");
        CustomerValidationUtils.validateOptionalMaxLength(
                detail.getBillingRegion(), CustomerValidationUtils.ADDRESS_REGION_MAX, "State / Province");
        CustomerValidationUtils.validateOptionalMaxLength(
                detail.getBillingCountry(), CustomerValidationUtils.ADDRESS_COUNTRY_MAX, "Country");
        CustomerValidationUtils.validateOptionalMaxLength(
                detail.getDeliveryStreetAddress1(), CustomerValidationUtils.ADDRESS_STREET_MAX, "Street Address 1");
        CustomerValidationUtils.validateOptionalMaxLength(
                detail.getDeliveryStreetAddress2(), CustomerValidationUtils.ADDRESS_STREET_MAX, "Street Address 2");
        CustomerValidationUtils.validateOptionalMaxLength(
                detail.getDeliverySuburb(), CustomerValidationUtils.ADDRESS_SUBURB_MAX, "Suburb");
        CustomerValidationUtils.validateOptionalMaxLength(
                detail.getDeliveryPostCode(), CustomerValidationUtils.ADDRESS_POSTCODE_MAX, "Postcode / ZIP Code");
        CustomerValidationUtils.validateOptionalMaxLength(
                detail.getDeliveryRegion(), CustomerValidationUtils.ADDRESS_REGION_MAX, "State / Province");
        CustomerValidationUtils.validateOptionalMaxLength(
                detail.getDeliveryCountry(), CustomerValidationUtils.ADDRESS_COUNTRY_MAX, "Country");
        CustomerValidationUtils.validateOptionalMaxLength(
                detail.getBusinessNumber(), CustomerValidationUtils.BUSINESS_NUMBER_MAX, "Business Number");
        CustomerValidationUtils.validateOptionalMaxLength(detail.getGender(), CustomerValidationUtils.GENDER_MAX, "Gender");
        CustomerValidationUtils.validateOptionalMaxLength(
                detail.getInvoiceMessage(), CustomerValidationUtils.TEXT_MAX, "Invoice and Statement Message");
        CustomerValidationUtils.validateOptionalMaxLength(
                detail.getComments(), CustomerValidationUtils.TEXT_MAX, "Comments");
        CustomerValidationUtils.validateLoyaltyPoints(detail.getLoyaltyPoints());

        if (detail.getName() == null || detail.getName().isBlank()) {
            detail.setName(buildName(detail.getFirstName(), detail.getLastName(), detail.getCompany()));
        }
        CustomerValidationUtils.validateName(detail.getName());
        return detail;
    }

    private void ensureUniqueActiveCode(String code, Long excludeId) {
        if (code == null || code.isBlank()) {
            return;
        }
        long count = excludeId == null
                ? customerMapper.countActiveByCode(code)
                : customerMapper.countActiveByCodeExcluding(code, excludeId);
        if (count > 0) {
            throw new BusinessException(DUPLICATE_CODE, "A customer with this code already exists.");
        }
    }

    private String generateUniqueCode() {
        for (int attempt = 0; attempt < 8; attempt++) {
            String code = "C" + System.currentTimeMillis() + (attempt == 0 ? "" : ("-" + attempt));
            if (code.length() > CustomerValidationUtils.CODE_MAX) {
                code = code.substring(0, CustomerValidationUtils.CODE_MAX);
            }
            if (customerMapper.countActiveByCode(code) == 0) {
                return code;
            }
            try {
                Thread.sleep(1);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        throw new BusinessException("Unable to generate a unique customer code.");
    }

    private void ensureUniqueActiveEmails(List<String> emails, Long excludeCustomerId) {
        for (String email : emails) {
            long count = customerEmailMapper.countActiveByEmailExcludingCustomer(email, excludeCustomerId, requireCurrentOutlet());
            if (count > 0) {
                throw new BusinessException(DUPLICATE_EMAIL, "A customer with this email already exists.");
            }
        }
    }

    @Transactional
    public void softDelete(Long id) {
        ensureInCurrentOutlet(id);
        if (customerMapper.findDetailById(id) == null) {
            throw new BusinessException("Customer not found.");
        }
        customerMapper.softDelete(id);
        customerEmailMapper.syncDeletedAtByCustomerId(id);
    }

    private static Long requireCurrentOutlet() {
        Long outletId = CurrentUser.outletId();
        if (outletId == null) throw new BusinessException(40100, "Authenticated outlet is required.");
        return outletId;
    }

    private void ensureInCurrentOutlet(Long id) {
        Long outletId = requireCurrentOutlet();
        Long actual = customerMapper.findOutletId(id);
        if (actual == null || !outletId.equals(actual)) {
            throw new BusinessException(40410, "Customer not found.");
        }
    }

    private RuntimeException constraintOrRethrow(RuntimeException e) {
        if (SqlConstraintUtils.isDuplicateCustomerCode(e)) {
            return new BusinessException(DUPLICATE_CODE, "A customer with this code already exists.");
        }
        if (SqlConstraintUtils.isDuplicateCustomerEmail(e)) {
            return new BusinessException(DUPLICATE_EMAIL, "A customer with this email already exists.");
        }
        return e;
    }

    private static String buildName(String firstName, String lastName, String company) {
        String person = String.join(" ",
                firstName != null ? firstName.trim() : "",
                lastName != null ? lastName.trim() : "").trim();
        if (!person.isBlank()) return person;
        if (company != null && !company.isBlank()) return company.trim();
        return "Untitled Customer";
    }

    private Long upsertContact(Long existingId, Contact contact) {
        if (existingId == null) {
            if (contact.isBlank()) return null;
            contactMapper.insert(contact);
            return contact.getId();
        }
        contact.setId(existingId);
        contactMapper.update(contact);
        return existingId;
    }

    private static Contact billingContact(CustomerDetail detail) {
        Contact contact = new Contact();
        contact.setAddressStreet1(trimToNull(detail.getBillingStreetAddress1()));
        contact.setAddressStreet2(trimToNull(detail.getBillingStreetAddress2()));
        contact.setAddressSuburb(trimToNull(detail.getBillingSuburb()));
        contact.setAddressPostcode(trimToNull(detail.getBillingPostCode()));
        contact.setAddressRegion(trimToNull(detail.getBillingRegion()));
        contact.setAddressCountry(trimToNull(detail.getBillingCountry()));
        contact.setWebsite(trimToNull(detail.getWebsite()));
        contact.setTwitter(trimToNull(detail.getTwitter()));
        contact.setFacebook(trimToNull(detail.getFacebook()));
        return contact;
    }

    private static Contact deliveryContact(CustomerDetail detail) {
        Contact contact = new Contact();
        contact.setAddressStreet1(trimToNull(detail.getDeliveryStreetAddress1()));
        contact.setAddressStreet2(trimToNull(detail.getDeliveryStreetAddress2()));
        contact.setAddressSuburb(trimToNull(detail.getDeliverySuburb()));
        contact.setAddressPostcode(trimToNull(detail.getDeliveryPostCode()));
        contact.setAddressRegion(trimToNull(detail.getDeliveryRegion()));
        contact.setAddressCountry(trimToNull(detail.getDeliveryCountry()));
        return contact;
    }

    private static String trimToNull(String value) {
        return CustomerValidationUtils.trimToNull(value);
    }
}
