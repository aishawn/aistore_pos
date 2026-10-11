package com.orithos.common;

import com.orithos.modules.customer.CustomerDetail;

import java.util.regex.Pattern;

/** Validation helpers for customer create/update. */
public final class CustomerValidationUtils {

    public static final int FIRST_NAME_MAX = 128;
    public static final int LAST_NAME_MAX = 128;
    public static final int NAME_MAX = 255;
    public static final int COMPANY_MAX = 255;
    public static final int CODE_MAX = 64;
    public static final int EMAIL_MAX = 255;
    public static final int PHONE_MAX = 64;
    public static final int URL_MAX = 255;
    public static final int ADDRESS_STREET_MAX = 255;
    public static final int ADDRESS_SUBURB_MAX = 128;
    public static final int ADDRESS_POSTCODE_MAX = 16;
    public static final int ADDRESS_REGION_MAX = 128;
    public static final int ADDRESS_COUNTRY_MAX = 128;
    public static final int BUSINESS_NUMBER_MAX = 64;
    public static final int GENDER_MAX = 32;
    public static final int TEXT_MAX = 4000;
    public static final java.math.BigDecimal LOYALTY_POINTS_MAX =
            new java.math.BigDecimal("999999999999.9999");

    private static final Pattern EMAIL_PATTERN =
            Pattern.compile("^[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}$");
    private static final Pattern PHONE_PATTERN = Pattern.compile("^[+\\d\\s\\-().]+$");
    private static final Pattern PURE_DIGITS = Pattern.compile("^\\d+$");

    private CustomerValidationUtils() {}

    public static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    public static void trimDetail(CustomerDetail detail) {
        detail.setFirstName(trimToNull(detail.getFirstName()));
        detail.setLastName(trimToNull(detail.getLastName()));
        detail.setName(trimToNull(detail.getName()));
        detail.setCode(trimToNull(detail.getCode()));
        detail.setCompany(trimToNull(detail.getCompany()));
        detail.setBusinessNumber(trimToNull(detail.getBusinessNumber()));
        detail.setGender(trimToNull(detail.getGender()));
        detail.setEmail(trimToNull(detail.getEmail()));
        detail.setPhone(trimToNull(detail.getPhone()));
        detail.setMobile(trimToNull(detail.getMobile()));
        detail.setFax(trimToNull(detail.getFax()));
        detail.setInvoiceMessage(trimToNull(detail.getInvoiceMessage()));
        detail.setComments(trimToNull(detail.getComments()));
        detail.setWebsite(trimToNull(detail.getWebsite()));
        detail.setTwitter(trimToNull(detail.getTwitter()));
        detail.setFacebook(trimToNull(detail.getFacebook()));
        detail.setBillingStreetAddress1(trimToNull(detail.getBillingStreetAddress1()));
        detail.setBillingStreetAddress2(trimToNull(detail.getBillingStreetAddress2()));
        detail.setBillingSuburb(trimToNull(detail.getBillingSuburb()));
        detail.setBillingPostCode(trimToNull(detail.getBillingPostCode()));
        detail.setBillingRegion(trimToNull(detail.getBillingRegion()));
        detail.setBillingCountry(trimToNull(detail.getBillingCountry()));
        detail.setDeliveryStreetAddress1(trimToNull(detail.getDeliveryStreetAddress1()));
        detail.setDeliveryStreetAddress2(trimToNull(detail.getDeliveryStreetAddress2()));
        detail.setDeliverySuburb(trimToNull(detail.getDeliverySuburb()));
        detail.setDeliveryPostCode(trimToNull(detail.getDeliveryPostCode()));
        detail.setDeliveryRegion(trimToNull(detail.getDeliveryRegion()));
        detail.setDeliveryCountry(trimToNull(detail.getDeliveryCountry()));
        if (detail.getEmails() != null) {
            detail.setEmails(detail.getEmails().stream()
                    .map(CustomerValidationUtils::trimToNull)
                    .filter(e -> e != null)
                    .distinct()
                    .toList());
        }
    }

    public static void validateFirstName(String firstName) {
        if (firstName == null || firstName.isBlank()) {
            throw new BusinessException("First name is required.");
        }
        if (firstName.length() > FIRST_NAME_MAX) {
            throw new BusinessException("First name must be at most " + FIRST_NAME_MAX + " characters.");
        }
        if (PURE_DIGITS.matcher(firstName).matches()) {
            throw new BusinessException("First name cannot be numbers only.");
        }
    }

    public static void validateLastName(String lastName) {
        if (lastName == null || lastName.isBlank()) {
            throw new BusinessException("Last name is required.");
        }
        if (lastName.length() > LAST_NAME_MAX) {
            throw new BusinessException("Last name must be at most " + LAST_NAME_MAX + " characters.");
        }
        if (PURE_DIGITS.matcher(lastName).matches()) {
            throw new BusinessException("Last name cannot be numbers only.");
        }
    }

    public static void validateCode(String code) {
        if (code == null || code.isBlank()) {
            return;
        }
        if (code.length() > CODE_MAX) {
            throw new BusinessException("Code must be at most " + CODE_MAX + " characters.");
        }
    }

    /** Validate a non-empty email value (blank emails are skipped by callers). */
    public static void validateEmail(String email) {
        if (email == null || email.isBlank()) {
            return;
        }
        if (email.length() > EMAIL_MAX) {
            throw new BusinessException("Email must be at most " + EMAIL_MAX + " characters.");
        }
        if (!EMAIL_PATTERN.matcher(email).matches()) {
            throw new BusinessException("Email format is invalid.");
        }
    }

    public static void validateOptionalPhone(String phone, String fieldLabel) {
        if (phone == null || phone.isBlank()) return;
        if (phone.length() > PHONE_MAX) {
            throw new BusinessException(fieldLabel + " must be at most " + PHONE_MAX + " characters.");
        }
        long digitCount = phone.chars().filter(Character::isDigit).count();
        if (digitCount < 7 || digitCount > 15 || !PHONE_PATTERN.matcher(phone).matches()) {
            throw new BusinessException(fieldLabel + " format is invalid.");
        }
    }

    public static void validateOptionalMaxLength(String value, int max, String fieldLabel) {
        if (value == null || value.isBlank()) return;
        if (value.length() > max) {
            throw new BusinessException(fieldLabel + " must be at most " + max + " characters.");
        }
    }

    public static void validateName(String name) {
        if (name == null || name.isBlank()) return;
        if (name.length() > NAME_MAX) {
            throw new BusinessException("Customer name must be at most " + NAME_MAX + " characters.");
        }
    }

    public static void validateLoyaltyPoints(java.math.BigDecimal points) {
        if (points == null) return;
        if (points.compareTo(java.math.BigDecimal.ZERO) < 0) {
            throw new BusinessException("Loyalty points cannot be negative.");
        }
        if (points.compareTo(LOYALTY_POINTS_MAX) > 0) {
            throw new BusinessException("Loyalty points value is too large.");
        }
        if (points.scale() > 4) {
            throw new BusinessException("Loyalty points value is invalid.");
        }
    }
}
