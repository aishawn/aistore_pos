package com.orithos.modules.ai;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiProviderConfigTest {

    @Test
    void acceptsHttpsProviderHostWithoutPath() {
        assertTrue(AiProviderConfig.isValidBaseUrl("https://dashscope.aliyuncs.com"));
        assertTrue(AiProviderConfig.isValidBaseUrl("https://dashscope.aliyuncs.com/"));
    }

    @Test
    void rejectsProviderApiPathsAndUnsafeHosts() {
        assertFalse(AiProviderConfig.isValidBaseUrl("https://dashscope.aliyuncs.com/api/v1"));
        assertFalse(AiProviderConfig.isValidBaseUrl("http://dashscope.aliyuncs.com"));
        assertFalse(AiProviderConfig.isValidBaseUrl("https://dashscope.aliyuncs.com?key=secret"));
        assertFalse(AiProviderConfig.isValidBaseUrl("not a url"));
    }
}
