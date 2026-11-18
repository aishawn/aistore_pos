package com.orithos.modules.eftpos.dto;

public record EftposAttemptView(
        Long attemptId,
        String orderUuid,
        int amountCents,
        String currency,
        String status,
        String providerReference,
        String connectorChallenge,
        String connectorBaseUrl,
        boolean paymentsEnabled
) {
}