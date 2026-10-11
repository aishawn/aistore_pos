package com.orithos.modules.customer;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** Flattened customer row for CSV export (includes joined group and contact data). */
@Data
public class CustomerExportRow {
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
    private String phone;
    private String mobile;
    private String fax;
    private Boolean allowMarketingEmails;
    private String invoiceMessage;
    private String comments;
    private String customerGroupName;
    private Boolean loyaltyEnabled;
    private BigDecimal loyaltyRate;
    private BigDecimal loyaltyPoints;
    private Boolean disablePromotions;
    private Long priceListId;
    private Boolean requireOrderReference;
    private BigDecimal accountLimit;
    private BigDecimal currentOwing;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    private String billingStreet1;
    private String billingStreet2;
    private String billingSuburb;
    private String billingCity;
    private String billingPostcode;
    private String billingRegion;
    private String billingCountry;
    private String billingWebsite;
    private String billingTwitter;
    private String billingFacebook;

    private String deliveryStreet1;
    private String deliveryStreet2;
    private String deliverySuburb;
    private String deliveryCity;
    private String deliveryPostcode;
    private String deliveryRegion;
    private String deliveryCountry;
    private String deliveryWebsite;
    private String deliveryTwitter;
    private String deliveryFacebook;
}
