package com.orithos.modules.ai.gateway;

/** Prompt identity included in audit and evaluation records. */
public record PromptVersion(String name, String version, String sha256) {
    public PromptVersion {
        if (name == null || name.isBlank() || version == null || version.isBlank()) {
            throw new IllegalArgumentException("Prompt name and version are required");
        }
        sha256 = sha256 == null ? "" : sha256;
    }
}
