package com.orithos.modules.ai.report;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.ai.report")
public class AiReportProperties {

    /** Base name for per-outlet RO users ({@code {username}_o{outletId}}). */
    private String username = "orithos_ai_ro";
    private String password = "";
    /**
     * If the tenant RO account cannot connect, execute on the primary DS.
     * Keep false in SaaS: primary can read every outlet.
     */
    private boolean fallbackToPrimary = false;
    /**
     * Provision every outlet's read-only report schema during application
     * startup. Keep disabled by default: schemas are provisioned lazily when a
     * report is queried, so a large tenant set cannot block deployment.
     */
    private boolean provisionAllOnStartup = false;
    private int queryTimeoutSeconds = 5;
    private int maxRows = 500;
    /** Report questions per outlet per hour. 0 disables. */
    private int queriesPerHour = 120;
    /** Estimated tokens per outlet per hour. 0 disables. */
    private int tokensPerHour = 200_000;
    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public boolean isFallbackToPrimary() {
        return fallbackToPrimary;
    }

    public void setFallbackToPrimary(boolean fallbackToPrimary) {
        this.fallbackToPrimary = fallbackToPrimary;
    }

    public boolean isProvisionAllOnStartup() {
        return provisionAllOnStartup;
    }

    public void setProvisionAllOnStartup(boolean provisionAllOnStartup) {
        this.provisionAllOnStartup = provisionAllOnStartup;
    }

    public int getQueryTimeoutSeconds() {
        return queryTimeoutSeconds;
    }

    public void setQueryTimeoutSeconds(int queryTimeoutSeconds) {
        this.queryTimeoutSeconds = queryTimeoutSeconds;
    }

    public int getMaxRows() {
        return maxRows;
    }

    public void setMaxRows(int maxRows) {
        this.maxRows = maxRows;
    }

    public int getQueriesPerHour() {
        return queriesPerHour;
    }

    public void setQueriesPerHour(int queriesPerHour) {
        this.queriesPerHour = queriesPerHour;
    }

    public int getTokensPerHour() {
        return tokensPerHour;
    }

    public void setTokensPerHour(int tokensPerHour) {
        this.tokensPerHour = tokensPerHour;
    }

}
