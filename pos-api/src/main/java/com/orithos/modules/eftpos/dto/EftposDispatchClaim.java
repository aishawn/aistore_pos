package com.orithos.modules.eftpos.dto;

public record EftposDispatchClaim(EftposAttemptView attempt, boolean dispatchAuthorized) {
}
