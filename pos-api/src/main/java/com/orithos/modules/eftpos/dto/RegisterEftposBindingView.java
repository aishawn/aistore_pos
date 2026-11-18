package com.orithos.modules.eftpos.dto;

public record RegisterEftposBindingView(
        Long registerId,
        boolean enabled,
        boolean paymentsEnabled,
        String integrationMode,
        String connectorBaseUrl,
        String terminalLabel,
        String terminalModel,
        String acquirer,
        boolean hasConnectorToken,
        String revealedConnectorToken
) {
    public RegisterEftposBindingView(
            Long registerId,
            boolean enabled,
            boolean paymentsEnabled,
            String integrationMode,
            String connectorBaseUrl,
            String terminalLabel,
            String terminalModel,
            String acquirer,
            boolean hasConnectorToken
    ) {
        this(registerId, enabled, paymentsEnabled, integrationMode, connectorBaseUrl,
                terminalLabel, terminalModel, acquirer, hasConnectorToken, null);
    }
}