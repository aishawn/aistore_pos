package com.orithos.modules.ai.replenishment;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PurchaseDraftGateTest {

    @Test
    void draftEnabledOnlyForAllowlistedHosts() {
        PurchaseDraftGate gate = new PurchaseDraftGate("true", "demo.orithos.com.au,skr.orithos.com.au");
        assertTrue(gate.draftEnabledForHost("skr.orithos.com.au"));
        assertTrue(gate.draftEnabledForHost("demo.orithos.com.au."));
        assertFalse(gate.draftEnabledForHost("evil.example"));
    }

    @Test
    void disabledWhenFlagOff() {
        PurchaseDraftGate gate = new PurchaseDraftGate("false", "skr.orithos.com.au");
        assertFalse(gate.draftEnabledForHost("skr.orithos.com.au"));
    }
}