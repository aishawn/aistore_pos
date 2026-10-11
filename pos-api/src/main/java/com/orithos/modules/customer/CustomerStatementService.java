package com.orithos.modules.customer;

import com.orithos.modules.config.Statement;
import com.orithos.modules.config.StatementMapper;
import com.orithos.modules.customer.mapper.CustomerMapper;
import com.orithos.modules.customer.mapper.CustomerStatementMapper;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
public class CustomerStatementService {

    private final CustomerStatementMapper statementMapper;
    private final CustomerMapper customerMapper;
    private final StatementMapper templateMapper;

    public CustomerStatementService(CustomerStatementMapper statementMapper,
                                    CustomerMapper customerMapper,
                                    StatementMapper templateMapper) {
        this.statementMapper = statementMapper;
        this.customerMapper = customerMapper;
        this.templateMapper = templateMapper;
    }

    public CustomerStatementsPreview preview(Long templateId,
                                             LocalDate startDate,
                                             LocalDate endDate,
                                             String name,
                                             List<Long> groupIds,
                                             boolean includeNoGroup,
                                             boolean filterGroups,
                                             Long customerId) {
        if (startDate == null || endDate == null) {
            throw new IllegalArgumentException("Start and end dates are required.");
        }
        if (endDate.isBefore(startDate)) {
            throw new IllegalArgumentException("End date must be on or after start date.");
        }

        LocalDateTime startAt = startDate.atStartOfDay();
        LocalDateTime endAt = endDate.plusDays(1).atStartOfDay();

        Statement template = templateId != null ? templateMapper.findById(templateId) : null;

        List<Long> customerIds;
        if (customerId != null) {
            customerIds = customerMapper.findById(customerId) != null ? List.of(customerId) : List.of();
        } else {
            customerIds = statementMapper.findCustomerIds(
                    startAt, endAt, name, groupIds, includeNoGroup, filterGroups);
        }

        List<CustomerStatement> statements = new ArrayList<>();
        for (Long id : customerIds) {
            Customer customer = customerMapper.findById(id);
            if (customer == null) continue;

            BigDecimal opening = nz(statementMapper.openingBalance(id, startAt));
            List<CustomerStatementLine> lines = statementMapper.linesInPeriod(id, startAt, endAt);

            BigDecimal charges = BigDecimal.ZERO;
            BigDecimal payments = BigDecimal.ZERO;
            for (CustomerStatementLine line : lines) {
                if ("PAYMENT".equals(line.getLineType())) {
                    payments = payments.add(nz(line.getAmount()));
                } else {
                    charges = charges.add(nz(line.getAmount()));
                }
            }

            CustomerStatement statement = new CustomerStatement();
            statement.setCustomerId(id);
            statement.setCustomerName(customer.getName());
            statement.setCompany(customer.getCompany());
            statement.setOpeningBalance(opening);
            statement.setClosingBalance(opening.add(charges).subtract(payments));
            statement.setCurrentOwing(nz(customer.getCurrentOwing()));
            statement.setLines(lines);
            statements.add(statement);
        }

        CustomerStatementsPreview preview = new CustomerStatementsPreview();
        preview.setTemplate(template);
        preview.setStartDate(startDate);
        preview.setEndDate(endDate);
        preview.setStatements(statements);
        return preview;
    }

    private static BigDecimal nz(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
