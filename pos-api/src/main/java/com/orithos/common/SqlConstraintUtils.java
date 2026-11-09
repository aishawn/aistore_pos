package com.orithos.common;

/** Helpers for mapping JDBC / MyBatis constraint failures to business errors. */
public final class SqlConstraintUtils {

    private SqlConstraintUtils() {}

    public static boolean isDuplicateProductName(Throwable throwable) {
        for (Throwable current = throwable; current != null; current = current.getCause()) {
            String message = current.getMessage();
            if (message == null) continue;
            if (message.contains("uq_product_active_name")
                    || message.contains("uq_product_outlet_active_name")
                    || message.contains("idx_product_name")) {
                return true;
            }
            if (message.contains("Duplicate entry") && message.contains("product")) {
                return true;
            }
        }
        return false;
    }

    public static boolean isInvalidCaseQuantity(Throwable throwable) {
        for (Throwable current = throwable; current != null; current = current.getCause()) {
            String message = current.getMessage();
            if (message == null) continue;
            if (message.contains("chk_product_case_quantity_positive")) {
                return true;
            }
        }
        return false;
    }

    public static boolean isInvalidPriceQuantity(Throwable throwable) {
        for (Throwable current = throwable; current != null; current = current.getCause()) {
            String message = current.getMessage();
            if (message == null) continue;
            if (message.contains("chk_product_price_quantity_positive")
                    || message.contains("chk_future_price_quantity_positive")) {
                return true;
            }
        }
        return false;
    }

    public static boolean isDuplicateBarcode(Throwable throwable) {
        for (Throwable current = throwable; current != null; current = current.getCause()) {
            String message = current.getMessage();
            if (message == null) continue;
            if (message.contains("uq_barcode_code")
                    || message.contains("uq_barcode_outlet_code")) {
                return true;
            }
            if (message.contains("Duplicate entry") && message.contains("product_barcode")) {
                return true;
            }
        }
        return false;
    }

    public static boolean isDuplicateCustomerCode(Throwable throwable) {
        for (Throwable current = throwable; current != null; current = current.getCause()) {
            String message = current.getMessage();
            if (message == null) continue;
            if (message.contains("uq_customer_active_code")) {
                return true;
            }
            if (message.contains("Duplicate entry")
                    && message.contains("customer")
                    && !message.contains("customer_email")
                    && !message.contains("customer_group")) {
                return true;
            }
        }
        return false;
    }

    public static boolean isDuplicateCustomerGroupName(Throwable throwable) {
        for (Throwable current = throwable; current != null; current = current.getCause()) {
            String message = current.getMessage();
            if (message == null) continue;
            if (message.contains("uq_customer_group_active_name")) {
                return true;
            }
            if (message.contains("Duplicate entry") && message.contains("customer_group")) {
                return true;
            }
        }
        return false;
    }

    public static boolean isDuplicateCustomerEmail(Throwable throwable) {
        for (Throwable current = throwable; current != null; current = current.getCause()) {
            String message = current.getMessage();
            if (message == null) continue;
            if (message.contains("uq_customer_email_active")) {
                return true;
            }
            if (message.contains("Duplicate entry") && message.contains("customer_email")) {
                return true;
            }
        }
        return false;
    }
}
