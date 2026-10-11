package com.orithos.common;

import java.util.Set;

/** GTIN barcode validation (EAN-8, UPC-A, EAN-13, ITF-14). */
public final class BarcodeUtils {

    public static final String FORMAT_MESSAGE =
            "Barcode must be 8, 12, 13, or 14 digits (EAN-8, UPC-A, EAN-13, or ITF-14) with a valid check digit.";

    private static final Set<Integer> ALLOWED_LENGTHS = Set.of(8, 12, 13, 14);

    private BarcodeUtils() {}

    public static String normalize(String barcode) {
        if (barcode == null) return "";
        return barcode.trim();
    }

    public static void validateFormat(String barcode) {
        String code = normalize(barcode);
        if (code.isEmpty()) {
            throw new BusinessException("Barcode is required.");
        }
        if (!code.chars().allMatch(Character::isDigit)) {
            throw new BusinessException(FORMAT_MESSAGE);
        }
        if (!ALLOWED_LENGTHS.contains(code.length())) {
            throw new BusinessException(FORMAT_MESSAGE);
        }
        if (!isValidGtinCheckDigit(code)) {
            throw new BusinessException("Invalid barcode check digit.");
        }
    }

    static boolean isValidGtinCheckDigit(String digits) {
        int len = digits.length();
        int sum = 0;
        for (int i = 0; i < len - 1; i++) {
            int d = digits.charAt(len - 2 - i) - '0';
            sum += (i % 2 == 0) ? d * 3 : d;
        }
        int check = (10 - (sum % 10)) % 10;
        return check == (digits.charAt(len - 1) - '0');
    }
}
