package com.orithos.modules.supplier;

import lombok.Data;

@Data
public class SupplierAuthentication {
    private Long supplierId;
    private String accountNumber;
    private String username;
    private String passwordHash;
    private String additionalAuth;

    public boolean isBlank() {
        return isBlank(accountNumber) && isBlank(username) && isBlank(passwordHash) && isBlank(additionalAuth);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
