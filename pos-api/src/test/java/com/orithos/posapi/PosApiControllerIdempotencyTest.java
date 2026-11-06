package com.orithos.posapi;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

class PosApiControllerIdempotencyTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void requestHashIncludesResourceAndPayload() throws Exception {
        JsonNode body = mapper.readTree("[{\"sourceId\":\"source-1\"}]");

        String purchaseHash = PosApiController.idempotencyHash("purchases", body);
        assertEquals(purchaseHash, PosApiController.idempotencyHash("purchases", body.deepCopy()));
        assertNotEquals(purchaseHash, PosApiController.idempotencyHash("sales", body));
        assertNotEquals(purchaseHash, PosApiController.idempotencyHash(
                "purchases", mapper.readTree("[{\"sourceId\":\"source-2\"}]")));
    }
}
