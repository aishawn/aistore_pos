package com.orithos.common;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class LenientLongDeserializerTest {

    private final ObjectMapper mapper = new ObjectMapper();

    static class Holder {
        @JsonDeserialize(using = LenientLongDeserializer.class)
        public Long productId;
    }

    @Test
    void acceptsNumericString() throws Exception {
        Holder h = mapper.readValue("{\"productId\":\"3\"}", Holder.class);
        assertEquals(3L, h.productId);
    }

    @Test
    void acceptsJsonNumber() throws Exception {
        Holder h = mapper.readValue("{\"productId\":42}", Holder.class);
        assertEquals(42L, h.productId);
    }

    @Test
    void slugBecomesNullInsteadOfFailing() throws Exception {
        Holder h = mapper.readValue(
                "{\"productId\":\"carltondraughtbtl375ml00000001\"}", Holder.class);
        assertNull(h.productId);
    }

    @Test
    void emptyAndNullBecomeNull() throws Exception {
        assertNull(mapper.readValue("{\"productId\":\"\"}", Holder.class).productId);
        assertNull(mapper.readValue("{\"productId\":null}", Holder.class).productId);
    }
}
