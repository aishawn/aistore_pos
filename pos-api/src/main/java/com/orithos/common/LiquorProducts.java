package com.orithos.common;

import java.math.BigDecimal;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Australian liquor licensing expects alcohol content (ABV) on wine, beer and spirits.
 */
public final class LiquorProducts {

    private static final Pattern VOLUME = Pattern.compile("(?i)(\\d+(?:\\.\\d+)?)\\s*(ml|l)\\b");
    private static final Pattern VINTAGE = Pattern.compile("^(?:NV|\\d{4})$");

    private static final Pattern LIQUOR = Pattern.compile(
            "(?i)(\\b(wines?|beers?|spirits?|liquor|ciders?|whisk(e)?ys?|rum|vodkas?|gins?|"
                    + "champagnes?|proseccos?|sakes?|liqueurs?|brand(y|ies)|tequilas?|ales?|lagers?|stouts?|"
                    + "alcohol|rtds?)\\b|啤酒|葡萄酒|白酒|威士忌|伏特加|洋酒|烈酒)");

    private LiquorProducts() {
    }

    public static boolean isLiquor(String name, String category) {
        String hay = ((name == null ? "" : name) + " " + (category == null ? "" : category)).trim();
        return !hay.isEmpty() && LIQUOR.matcher(hay).find();
    }

    public static void requireAbv(BigDecimal abv) {
        if (abv == null) {
            throw new BusinessException("Alcohol by volume (ABV %) is required for liquor products.");
        }
        if (abv.signum() < 0 || abv.compareTo(new BigDecimal("100")) > 0) {
            throw new BusinessException("ABV must be between 0 and 100.");
        }
    }

    /** Container size in millilitres, parsed from a name such as "375ml" or "1.5L". */
    public static Integer volumeMlFromName(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        Matcher matcher = VOLUME.matcher(name);
        if (!matcher.find()) {
            return null;
        }
        double amount = Double.parseDouble(matcher.group(1));
        boolean litres = matcher.group(2).equalsIgnoreCase("l");
        int ml = (int) Math.round(litres ? amount * 1000 : amount);
        return ml > 0 ? ml : null;
    }

    public static void requireVolumeMl(Integer volumeMl) {
        if (volumeMl == null) {
            return;
        }
        if (volumeMl < 1 || volumeMl > 20000) {
            throw new BusinessException("Volume must be between 1 and 20000 ml.");
        }
    }

    public static String normalizeRegion(String region) {
        if (region == null) {
            return null;
        }
        String trimmed = region.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.length() > 128) {
            throw new BusinessException("Region must be 128 characters or fewer.");
        }
        return trimmed;
    }

    /** Four-digit year, or NV for non-vintage. Blank clears the field. */
    public static String normalizeVintage(String vintage) {
        if (vintage == null) {
            return null;
        }
        String trimmed = vintage.trim().toUpperCase();
        if (trimmed.isEmpty()) {
            return null;
        }
        if (!VINTAGE.matcher(trimmed).matches()) {
            throw new BusinessException("Vintage must be a four-digit year or NV.");
        }
        return trimmed;
    }
}
