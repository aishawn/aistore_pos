package com.orithos.modules.customer;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
public class CustomerStatement {
    private Long customerId;
    private String customerName;
    private String company;
    private BigDecimal openingBalance;
    private BigDecimal closingBalance;
    private BigDecimal currentOwing;
    private List<CustomerStatementLine> lines;
}
