package com.orithos.modules.utility;

import lombok.Data;

/** Maps to table vendor_connection. */
@Data
public class VendorConnection {
    private Long id;
    private String name;
    private String senderCode;
    private Long customerId;
}
