package com.orithos.modules.ai.report;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CategoryLexiconTest {

    @Test
    void beerClassExpandsToEnglish() {
        List<String> terms = CategoryLexicon.searchTerms("啤酒类");
        assertTrue(terms.contains("啤酒"));
        assertTrue(terms.stream().anyMatch(t -> t.equalsIgnoreCase("beer")));
    }

    @Test
    void expandLikeAddsEnglishToken() {
        String sql = "SELECT 1 FROM ai_rpt_product p WHERE p.category_name LIKE '%啤酒%' LIMIT 1";
        String expanded = CategoryLexicon.expandLikePredicates(sql);
        assertTrue(expanded.contains("Beer") || expanded.toLowerCase().contains("beer"));
        assertTrue(expanded.contains("啤酒"));
        assertTrue(expanded.contains(" OR "));
    }

    @Test
    void unknownCategoryStaysSingleTerm() {
        assertEquals(List.of("Wine"), CategoryLexicon.searchTerms("Wine"));
        String sql = "SELECT 1 FROM ai_rpt_product p WHERE p.name LIKE '%Wine%' LIMIT 1";
        assertEquals(sql, CategoryLexicon.expandLikePredicates(sql));
    }
}
