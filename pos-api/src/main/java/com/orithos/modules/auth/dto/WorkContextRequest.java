package com.orithos.modules.auth.dto;

import jakarta.validation.constraints.NotNull;

public record WorkContextRequest(
        @NotNull Long outletId,
        Long registerId,
        boolean globalMode
) {}