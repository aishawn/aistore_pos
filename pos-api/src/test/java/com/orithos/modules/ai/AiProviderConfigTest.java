package com.orithos.modules.ai;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiProviderConfigTest {

    @Test
    void acceptsHttpsProviderHostWithoutPath() {
        assertTrue(AiProviderConfig.isValidBaseUrl("https://ai.orithos.com.au"));
        assertTrue(AiProviderConfig.isValidBaseUrl("https://ai.orithos.com.au/"));
    }

    @Test
    void rejectsProviderApiPathsAndUnsafeHosts() {
        assertFalse(AiProviderConfig.isValidBaseUrl("https://ai.orithos.com.au/api/v1"));
        assertFalse(AiProviderConfig.isValidBaseUrl("http://ai.orithos.com.au"));
        assertFalse(AiProviderConfig.isValidBaseUrl("https://ai.orithos.com.au?key=secret"));
        assertFalse(AiProviderConfig.isValidBaseUrl("not a url"));
    }
}
