package com.orithos.modules.register;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class RegisterClosure {
    private Long id;
    private Long registerId;
    private Long outletId;
    private Long userId;
    private BigDecimal movement;
    private BigDecimal totalExpected;
    private BigDecimal totalReceived;
    private Integer totalTransactions;
    private BigDecimal totalSurcharge;
    private LocalDateTime openedAt;
    private LocalDateTime closedAt;
    private String note;
    private List<RegisterClosurePayment> payments;
}
