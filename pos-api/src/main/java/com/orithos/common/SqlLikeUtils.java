package com.orithos.common;

/** Helpers for safe SQL LIKE patterns (used with {@code ESCAPE '!'}). */
public final class SqlLikeUtils {

    private SqlLikeUtils() {}

    /**
     * Escape user input for {@code LIKE ... ESCAPE '!'} so {@code %}, {@code _} and
     * {@code !} are matched literally instead of as wildcards.
     */
    public static String escapeLike(String value) {
        if (value == null) {
            return null;
        }
        return value
                .replace("!", "!!")
                .replace("%", "!%")
                .replace("_", "!_");
    }

    /** Trim blank input to null, then escape LIKE metacharacters. */
    public static String prepareLikeSearch(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        return escapeLike(trimmed);
    }
}
