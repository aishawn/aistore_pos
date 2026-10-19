package com.orithos.modules.ai;

import java.net.URI;

/** Small readiness guard for provider URLs before an AI request reaches the network. */
public final class AiProviderConfig {

    private AiProviderConfig() {
    }

    public static boolean isValidBaseUrl(String raw) {
        if (raw == null || raw.isBlank()) {
            return false;
        }
        try {
            URI uri = URI.create(raw.trim());
            String scheme = uri.getScheme();
            String host = uri.getHost();
            String path = uri.getPath();
            boolean local = "localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host);
            return host != null
                    && ("https".equalsIgnoreCase(scheme) || ("http".equalsIgnoreCase(scheme) && local))
                    && (path == null || path.isBlank() || "/".equals(path))
                    && uri.getQuery() == null
                    && uri.getFragment() == null;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
