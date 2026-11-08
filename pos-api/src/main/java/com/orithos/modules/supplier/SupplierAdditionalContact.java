package com.orithos.modules.supplier;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;

@Data
public class SupplierAdditionalContact {
    private Long id;
    private Long supplierId;
    @JsonIgnore
    private Long outletId;
    private String name;
    private String email;
    private String phone;
    private Integer sortOrder;

    public boolean isBlank() {
        return isBlank(name) && isBlank(email) && isBlank(phone);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
