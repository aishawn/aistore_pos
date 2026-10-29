package com.orithos.modules.ai.odoo;

import java.util.ArrayList;
import java.util.List;

/** Builds the read-only POS sales scope shared by snapshot and suggestion adapters. */
public final class OdooSalesDomain {
    private OdooSalesDomain() { }

    public static List<Object> forCompany(long companyId, Long posConfigId, List<String> paidStates) {
        List<Object> domain = new ArrayList<>(List.of(
                List.of("order_id.company_id", "=", companyId),
                List.of("order_id.state", "in", paidStates)));
        if (posConfigId != null && posConfigId > 0) {
            domain.add(List.of("order_id.config_id", "=", posConfigId));
        }
        return domain;
    }
}
