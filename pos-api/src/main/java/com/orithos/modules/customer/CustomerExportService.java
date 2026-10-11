package com.orithos.modules.customer;

import com.orithos.common.CsvUtils;
import com.orithos.modules.customer.mapper.CustomerMapper;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class CustomerExportService {

    private final CustomerMapper customerMapper;

    public CustomerExportService(CustomerMapper customerMapper) {
        this.customerMapper = customerMapper;
    }

    public byte[] exportCsv(String level,
                            String name,
                            List<Long> groupIds,
                            boolean includeNoGroup,
                            boolean filterGroups) {
        List<CustomerExportRow> rows = customerMapper.export(
                name, groupIds, includeNoGroup, filterGroups);

        StringBuilder sb = new StringBuilder();
        boolean full = "full".equalsIgnoreCase(level);
        if (full) {
            sb.append(CsvUtils.headerRow(
                    "Name", "First Name", "Last Name", "Company", "Code", "Business Number",
                    "Birthday", "Gender", "Customer Group", "Email", "Phone", "Mobile", "Fax",
                    "Subscribed to Marketing Emails", "Loyalty Enabled", "Loyalty Rate",
                    "Loyalty Points", "Disable Promotions", "Price List ID",
                    "Require Order Reference", "Account Limit", "Current Owing",
                    "Invoice Message", "Comments", "Created At", "Updated At"
            )).append('\n');
            for (CustomerExportRow r : rows) {
                sb.append(CsvUtils.row(
                        r.getName(), r.getFirstName(), r.getLastName(), r.getCompany(), r.getCode(),
                        r.getBusinessNumber(), r.getBirthday(), r.getGender(), r.getCustomerGroupName(),
                        r.getEmail(), r.getPhone(), r.getMobile(), r.getFax(), r.getAllowMarketingEmails(),
                        r.getLoyaltyEnabled(), r.getLoyaltyRate(), r.getLoyaltyPoints(), r.getDisablePromotions(),
                        r.getPriceListId(), r.getRequireOrderReference(), r.getAccountLimit(), r.getCurrentOwing(),
                        r.getInvoiceMessage(), r.getComments(), r.getCreatedAt(), r.getUpdatedAt()
                )).append('\n');
            }
        } else {
            sb.append(CsvUtils.headerRow(
                    "Name", "Company", "Code", "Birthday", "Email Addresses",
                    "Phone Number", "Subscribed to Marketing Emails"
            )).append('\n');
            for (CustomerExportRow r : rows) {
                sb.append(CsvUtils.row(
                        r.getName(), r.getCompany(), r.getCode(), r.getBirthday(), r.getEmail(),
                        r.getPhone(), r.getAllowMarketingEmails()
                )).append('\n');
            }
        }
        return CsvUtils.toUtf8Bytes(sb.toString());
    }
}
