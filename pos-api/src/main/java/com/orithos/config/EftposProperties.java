package com.orithos.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "orithos.eftpos")
public class EftposProperties {
    /** Enables simulate-approval and permissive connector callbacks for lab / register testing. */
    private boolean testMode;
    /** When true, EFTPOS checkout requires an APPROVED payment attempt for the idempotency key. */
    private boolean enforceCardCapture;

    public boolean isTestMode() {
        return testMode;
    }

    public void setTestMode(boolean testMode) {
        this.testMode = testMode;
    }

    public boolean isEnforceCardCapture() {
        return enforceCardCapture;
    }

    public void setEnforceCardCapture(boolean enforceCardCapture) {
        this.enforceCardCapture = enforceCardCapture;
    }
}