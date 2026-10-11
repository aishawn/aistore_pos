package com.orithos.modules.customer;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
public class Customer {
    private Long id;
    private String name;
    private String firstName;
    private String lastName;
    private String code;
    private String company;
    private String businessNumber;
    private LocalDate birthday;
    private Boolean allowMarketingEmails;
    private String email;
    private String phone;
    private String mobile;
    private Long customerGroupId;
    private Boolean loyaltyEnabled;
    private BigDecimal loyaltyPoints;
    private Long priceListId;
    private BigDecimal accountLimit;
    private BigDecimal currentOwing;
    private LocalDateTime createdAt;
    /** Joined for display. */
    private String customerGroupName;
}
