package com.orithos.common;

import java.util.Locale;
import java.util.Set;

/** Shared database identity rules for POS write authorization and UAT attestation. */
public final class PosDatabaseIdentity {
    private static final Set<String> SHARED_DATABASE_NAMES = Set.of(
            "postgres", "aipos", "orithos", "production", "prod");

    private PosDatabaseIdentity() { }

    public static boolean matchesIsolatedDatabase(String actual, String expected) {
        return verify(actual, expected) == VerificationStatus.VERIFIED;
    }

    public static VerificationStatus verify(String actual, String expected) {
        String actualName = normalize(actual);
        String expectedName = normalize(expected);
        if (expectedName.isEmpty()) return VerificationStatus.EXPECTED_DATABASE_UNSET;
        if (actualName.isEmpty()) return VerificationStatus.ACTUAL_DATABASE_UNAVAILABLE;
        if (!actualName.equals(expectedName)) return VerificationStatus.DATABASE_NAME_MISMATCH;
        if (SHARED_DATABASE_NAMES.contains(actualName.toLowerCase(Locale.ROOT))) {
            return VerificationStatus.SHARED_DATABASE_NAME;
        }
        return VerificationStatus.VERIFIED;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }

    public enum VerificationStatus {
        EXPECTED_DATABASE_UNSET,
        ACTUAL_DATABASE_UNAVAILABLE,
        DATABASE_NAME_MISMATCH,
        SHARED_DATABASE_NAME,
        VERIFIED
    }
}
