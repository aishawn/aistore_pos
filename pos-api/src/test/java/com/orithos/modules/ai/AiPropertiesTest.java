package com.orithos.modules.ai;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiPropertiesTest {

    @Test
    void assistantTimeoutHasHardLowerAndUpperBounds() {
        assertEquals(5, propertiesWithTimeout(1).timeoutSeconds());
        assertEquals(60, propertiesWithTimeout(600).timeoutSeconds());
        assertEquals(40, propertiesWithTimeout(0).timeoutSeconds());
    }

    private static AiProperties propertiesWithTimeout(int timeoutSeconds) {
        return new AiProperties(true, "test", null, null, null, 0.1, 1024,
                timeoutSeconds, 6, 120);
    }
}
