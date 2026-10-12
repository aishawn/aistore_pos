package com.orithos.modules.ai.report;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.ai.report")
public class AiReportProperties {

    /** Base name for per-outlet RO users ({@code {username}_o{outletId}}). */
    private String username = "orithos_ai_ro";
    private String password = "orithos-ai-ro";
    /**
     * If the tenant RO account cannot connect, execute on the primary DS.
     * Keep false in SaaS: primary can read every outlet.
     */
    private boolean fallbackToPrimary = false;
    private int queryTimeoutSeconds = 5;
    private int maxRows = 500;
    /** Report questions per outlet per hour. 0 disables. */
    private int queriesPerHour = 120;
    /** Estimated tokens per outlet per hour. 0 disables. */
    private int tokensPerHour = 200_000;
    /**
     * When true, every report_* intent (including templates) is rewritten to
     * {@code report_adhoc} and routed through NL2SQL. Local testing only.
     */
    private boolean forceNl2sql = false;

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

    public boolean isForceNl2sql() {
        return forceNl2sql;
    }

    public void setForceNl2sql(boolean forceNl2sql) {
        this.forceNl2sql = forceNl2sql;
    }
}
