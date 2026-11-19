package com.orithos.modules.ai.sommelier;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WineLexiconTest {

    @Test
    void shirazIsFullBodiedDryRed() {
        WineProfile p = WineLexicon.infer("Penfolds Bin 28 Kalimna Shiraz 2022", "Wine", "Wine", null);
        assertEquals("red", p.wineType());
        assertEquals("Shiraz", p.varietal());
        assertEquals("2022", p.vintage());
        assertTrue(p.dryness() > 0.7);
        assertTrue(p.body() > 0.8);
        assertTrue(p.foodTags().contains("steak"));
    }

    @Test
    void sauvignonBlancIsCrispWhite() {
        WineProfile p = WineLexicon.infer("Cloudy Bay Sauvignon Blanc", "White Wine", "Wine", null);
        assertEquals("white", p.wineType());
        assertTrue(p.body() < 0.5);
        assertTrue(p.foodTags().contains("fish") || p.foodTags().contains("seafood"));
    }

    @Test
    void explicitRoseStyleWinsOverPinotNoirVarietal() {
        WineProfile p = WineLexicon.infer("Babich Marlborough Pinot Noir Rose 750ml", "Wine", "Wine", null);
        assertEquals("rose", p.wineType());
        assertEquals("rose", WineLexicon.infer("Pinot Noir Rosé 750ml", "Wine", "Wine", null).wineType());
        assertEquals("red", WineLexicon.infer("Rosemount Shiraz 750ml", "Wine", "Wine", null).wineType());
    }

    @Test
    void beerNameIsNotWine() {
        assertFalse(WineLexicon.looksLikeWine("Carlton Draught Btl 375ml", "Beer Local", "Beer"));
        assertTrue(WineLexicon.looksLikeWine("155 PINOT NOIR 750ML", "Beer Local", null));
    }

    @Test
    void chineseBbqCanonicalises() {
        assertEquals("bbq", WineLexicon.canonicalFoodOne("Chinese BBQ"));
        assertEquals(List.of("bbq"), WineLexicon.canonicalFood(List.of("Chinese BBQ")));
    }
}
