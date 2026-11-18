package com.orithos.modules.eftpos.dto;

import java.math.BigDecimal;

public record CreateEftposAttemptRequest(
        String orderUuid,
        BigDecimal expectedTotal,
        String quoteSignature
) {
}