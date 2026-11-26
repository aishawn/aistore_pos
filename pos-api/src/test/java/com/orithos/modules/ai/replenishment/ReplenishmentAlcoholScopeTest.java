package com.orithos.modules.ai.replenishment;

import org.junit.jupiter.api.Test;

import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ReplenishmentAlcoholScopeTest {
    private static final Pattern ALCOHOL_KEYWORDS = Pattern.compile(
            ReplenishmentSalesQuery.ALCOHOL_KEYWORD_PATTERN, Pattern.CASE_INSENSITIVE);
    private static final Pattern NON_ALCOHOL_KEYWORDS = Pattern.compile(
            ReplenishmentSalesQuery.NON_ALCOHOL_KEYWORD_PATTERN, Pattern.CASE_INSENSITIVE);

    @Test
    void englishTermsMatchAsWordsInsteadOfSubstrings() {
        assertTrue(ALCOHOL_KEYWORDS.matcher("COOPERS MILD ALE CAN 375ML").find());
        assertTrue(ALCOHOL_KEYWORDS.matcher("\u7ea2\u9152 Shiraz").find());
        assertFalse(ALCOHOL_KEYWORDS.matcher("Bertolli extra virgin olive oil originale").find());
        assertFalse(ALCOHOL_KEYWORDS.matcher("Ginger seasoning").find());
    }

    @Test
    void knownNonAlcoholMatchesRemainExcluded() {
        assertTrue(NON_ALCOHOL_KEYWORDS.matcher("Balsamic vinegar").find());
        assertTrue(NON_ALCOHOL_KEYWORDS.matcher("\u9152\u5fc3\u7cd6 gift box").find());
        assertTrue(ReplenishmentSalesQuery.ALCOHOL_SCOPE_PREDICATE
                .contains("~* '" + ReplenishmentSalesQuery.ALCOHOL_KEYWORD_PATTERN + "'"));
        assertTrue(ReplenishmentSalesQuery.ALCOHOL_SCOPE_PREDICATE
                .contains("!~* '" + ReplenishmentSalesQuery.NON_ALCOHOL_KEYWORD_PATTERN + "'"));
    }
}
