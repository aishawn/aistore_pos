package com.orithos.common;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;

import java.io.IOException;

/**
 * Reads a Long from JSON numbers or numeric strings.
 * Non-numeric strings (e.g. product slugs) become null instead of failing the whole request.
 */
public class LenientLongDeserializer extends JsonDeserializer<Long> {

    @Override
    public Long deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
        JsonToken token = p.currentToken();
        if (token == JsonToken.VALUE_NULL) {
            return null;
        }
        if (token == JsonToken.VALUE_NUMBER_INT || token == JsonToken.VALUE_NUMBER_FLOAT) {
            return p.getLongValue();
        }
        if (token == JsonToken.VALUE_STRING) {
            return parseNumeric(p.getText());
        }
        return (Long) ctxt.handleUnexpectedToken(Long.class, p);
    }

    @Override
    public Long getNullValue(DeserializationContext ctxt) {
        return null;
    }

    static Long parseNumeric(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.trim();
        if (s.isEmpty()) {
            return null;
        }
        for (int i = 0; i < s.length(); i++) {
            if (!Character.isDigit(s.charAt(i))) {
                return null;
            }
        }
        try {
            return Long.valueOf(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
