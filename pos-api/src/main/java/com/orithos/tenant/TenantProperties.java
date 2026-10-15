package com.orithos.tenant;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

@Component
@ConfigurationProperties(prefix = "app.tenant")
public class TenantProperties {

    private String baseDomain = "orithos.com.au";
    private String reservedSlugs = "www,app,api,odoo,demo,cdn,support,mail,status";
    private int trialDays = 14;
    private String scheme = "https";
    /**
     * Vendor subdomain whose admins may manage all stores from the control plane
     * (app.orithos.com.au). Defaults to the seeded {@code default} vendor.
     */
    private String platformOperatorSlug = "default";

    public String getBaseDomain() {
        return baseDomain;
    }

    public void setBaseDomain(String baseDomain) {
        this.baseDomain = baseDomain;
    }

    public String getReservedSlugs() {
        return reservedSlugs;
    }

    public void setReservedSlugs(String reservedSlugs) {
        this.reservedSlugs = reservedSlugs;
    }

    public int getTrialDays() {
        return trialDays;
    }

    public void setTrialDays(int trialDays) {
        this.trialDays = trialDays;
    }

    public String getScheme() {
        return scheme;
    }

    public void setScheme(String scheme) {
        this.scheme = scheme;
    }

    public String getPlatformOperatorSlug() {
        return platformOperatorSlug;
    }

    public void setPlatformOperatorSlug(String platformOperatorSlug) {
        this.platformOperatorSlug = platformOperatorSlug;
    }

    public String platformOperatorSlugNormalized() {
        String raw = platformOperatorSlug == null ? "default" : platformOperatorSlug.trim();
        return raw.isEmpty() ? "default" : raw.toLowerCase(Locale.ROOT);
    }

    public Set<String> reservedSlugSet() {
        return Arrays.stream(reservedSlugs.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(s -> s.toLowerCase(Locale.ROOT))
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    public String storeUrl(String subdomain) {
        String host = subdomain + "." + baseDomain.trim().toLowerCase(Locale.ROOT);
        return scheme.trim() + "://" + host;
    }
}
