package com.orithos.modules.eftpos.dto;

public record UpsertRegisterEftposBindingRequest(
        boolean enabled,
        boolean paymentsEnabled,
        String integrationMode,
        String connectorBaseUrl,
        String terminalLabel,
        String terminalModel,
        String acquirer,
        boolean rotateConnectorToken
) {
}