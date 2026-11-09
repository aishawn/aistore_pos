package com.orithos.common;

import java.util.Locale;
import java.util.Set;

/** Shared database identity rules for POS write authorization and UAT attestation. */
public final class PosDatabaseIdentity {
    private static final Set<String> SHARED_DATABASE_NAMES = Set.of(
            "postgres", "aipos", "orithos", "production", "prod");

    private PosDatabaseIdentity() { }

    public static boolean matchesIsolatedDatabase(String actual, String expected) {
        String actualName = normalize(actual);
        String expectedName = normalize(expected);
        return !actualName.isEmpty()
                && actualName.equals(expectedName)
                && !SHARED_DATABASE_NAMES.contains(actualName.toLowerCase(Locale.ROOT));
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }
}
