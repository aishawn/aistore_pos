package com.orithos.modules.customer;

import com.orithos.modules.config.Statement;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

@Data
public class CustomerStatementsPreview {
    private Statement template;
    private LocalDate startDate;
    private LocalDate endDate;
    private List<CustomerStatement> statements;
}
