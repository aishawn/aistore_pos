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

    @Test
    void purchaseUnitCostMustBeExplicitAndNonNegative() throws Exception {
        assertEquals(new java.math.BigDecimal("2.75"), PosApiController.requiredUnitCost(
                mapper.readTree("{\"unitCost\":2.75}")));
        assertEquals(java.math.BigDecimal.ZERO, PosApiController.requiredUnitCost(
                mapper.readTree("{\"unitCost\":0}")));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> PosApiController.requiredUnitCost(mapper.readTree("{}")));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> PosApiController.requiredUnitCost(mapper.readTree("{\"unitCost\":-1}")));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> PosApiController.requiredUnitCost(mapper.readTree("{\"unitCost\":\"2.75\"}")));
    }

    @Test
    void idempotencyReplayKeepsAcceptedAndCompletedHttpSemantics() {
        assertEquals(org.springframework.http.HttpStatus.ACCEPTED,
                PosApiController.idempotencyHttpStatus("accepted"));
        assertEquals(org.springframework.http.HttpStatus.OK,
                PosApiController.idempotencyHttpStatus("completed"));
        assertEquals(org.springframework.http.HttpStatus.OK,
                PosApiController.idempotencyHttpStatus("failed"));
    }
}
