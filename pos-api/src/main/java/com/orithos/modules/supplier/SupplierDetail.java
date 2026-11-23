package com.orithos.modules.supplier;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/** Full supplier payload for read/write, including joined contact data. */
@Data
public class SupplierDetail {
    private Long id;
    @JsonIgnore
    private Long outletId;
    private String name;
    private Integer mdbId;
    private String status;
    private String businessNumber;
    private String accountNumber;
    private String orderNotes;
    private String internalOrderNotes;
    private Boolean orderAutomaticEmail;
    private String defaultOrderTax;
    private String emailFormat;
    private String comments;
    private BigDecimal feeAmount;
    private String distributeFees;
    private String distributeFreight;
    private Boolean freightIncludedOnInvoices;
    private Long freightTaxId;
    private Long feesTaxId;
    private Boolean allowOrderBelowMinimum;
    private BigDecimal minimumOrderValue;
    private BigDecimal maximumOrderValue;
    private Integer defaultDaysUntilDue;
    private Integer leadTimeDays;
    @JsonIgnore
    private boolean leadTimeDaysProvided;

    public void setLeadTimeDays(Integer leadTimeDays) {
        this.leadTimeDays = leadTimeDays;
        this.leadTimeDaysProvided = true;
    }
    private BigDecimal freightFixedCostPerCase;

    /** Internal FK used when persisting contact. */
    private Long contactId;

    private String email;
    private String fax;
    private String phone;
    private String mobile;
    private String website;
    private String twitter;
    private String facebook;
    private String streetAddress1;
    private String streetAddress2;
    private String suburb;
    private String city;
    private String postCode;
    private String region;
    private String country;

    private String authAccountNumber;
    private String username;
    /** Write-only; never returned from the API. */
    private String password;
    private String additionalAuth;
    private List<SupplierAdditionalContact> additionalContacts;
}
