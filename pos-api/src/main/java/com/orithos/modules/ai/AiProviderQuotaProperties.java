package com.orithos.modules.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.ai.provider-quota")
public class AiProviderQuotaProperties {

    /** Provider-backed AI requests per outlet per UTC hour. 0 disables the cap. */
    private int requestsPerHour = 120;
    /** Estimated provider tokens per outlet per UTC hour. 0 disables the cap. */
    private int tokensPerHour = 200_000;

    public int getRequestsPerHour() {
        return requestsPerHour;
    }

    public void setRequestsPerHour(int requestsPerHour) {
        this.requestsPerHour = requestsPerHour;
    }

    public int getTokensPerHour() {
        return tokensPerHour;
    }

    public void setTokensPerHour(int tokensPerHour) {
        this.tokensPerHour = tokensPerHour;
    }
}
