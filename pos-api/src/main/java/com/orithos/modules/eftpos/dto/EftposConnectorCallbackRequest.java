package com.orithos.modules.eftpos.dto;

public record EftposConnectorCallbackRequest(
        Long attemptId,
        String connectorChallenge,
        String status,
        String providerReference
) {
}