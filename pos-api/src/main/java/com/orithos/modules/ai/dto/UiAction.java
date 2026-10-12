package com.orithos.modules.ai.dto;

/** UI instruction for Phase A frontend dispatcher (auto navigate / search). */
public record UiAction(
        String panel,
        String view,
        String route,
        String action
) {}
