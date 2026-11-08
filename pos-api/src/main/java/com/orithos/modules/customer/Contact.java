package com.orithos.modules.customer;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;

@Data
public class Contact {
    private Long id;
    @JsonIgnore
    private Long outletId;
    private String addressStreet1;
    private String addressStreet2;
    private String addressSuburb;
    private String addressCity;
    private String addressPostcode;
    private String addressRegion;
    private String addressCountry;
    private String email;
    private String fax;
    private String phone;
    private String mobile;
    private String website;
    private String twitter;
    private String facebook;

    public boolean isBlank() {
        return isBlank(addressStreet1) && isBlank(addressStreet2) && isBlank(addressSuburb)
                && isBlank(addressCity) && isBlank(addressPostcode) && isBlank(addressRegion)
                && isBlank(addressCountry) && isBlank(email) && isBlank(fax) && isBlank(phone)
                && isBlank(mobile) && isBlank(website) && isBlank(twitter) && isBlank(facebook);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
