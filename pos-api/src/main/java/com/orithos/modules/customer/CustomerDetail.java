package com.orithos.modules.customer;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** Full customer payload for read/write, including joined contact address data. */
@Data
public class CustomerDetail {
    /** Store scope assigned by the authenticated outlet; never accepted from browser input. */
    private Long outletId;
    private Long id;
    private String name;
    private String firstName;
    private String lastName;
    private String code;
    private String company;
    private String businessNumber;
    private LocalDate birthday;
    private String gender;
    private String email;
    /** All email addresses for this customer (primary is also stored in {@link #email}). */
    private List<String> emails;
    private String phone;
    private String mobile;
    private String fax;
    private Boolean allowMarketingEmails;
    private Long customerGroupId;
    private Boolean overrideCustomerGroup;
    private String customerGroupName;
    private Boolean loyaltyEnabled;
    private BigDecimal loyaltyPoints;
    private Boolean disablePromotions;
    private Long priceListId;
    private String priceListName;
    private String invoiceMessage;
    private String comments;
    private BigDecimal accountLimit;
    private BigDecimal currentOwing;
    private LocalDateTime createdAt;

    /** Internal FK fields used when persisting contacts. */
    private Long billingContactId;
    private Long deliveryContactId;

    private String website;
    private String twitter;
    private String facebook;

    private String billingStreetAddress1;
    private String billingStreetAddress2;
    private String billingSuburb;
    private String billingPostCode;
    private String billingRegion;
    private String billingCountry;

    private String deliveryStreetAddress1;
    private String deliveryStreetAddress2;
    private String deliverySuburb;
    private String deliveryPostCode;
    private String deliveryRegion;
    private String deliveryCountry;
}
