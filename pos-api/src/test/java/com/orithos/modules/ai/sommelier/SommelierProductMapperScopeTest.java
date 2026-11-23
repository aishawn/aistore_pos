package com.orithos.modules.ai.sommelier;

import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.io.Resources;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;

class SommelierProductMapperScopeTest {

    private static final String RESOURCE = "mapper/SommelierProductMapper.xml";
    private static final String NAMESPACE = "com.orithos.modules.ai.sommelier.mapper.SommelierProductMapper.";

    @Test
    void everyCatalogReadIsRestrictedToTheCurrentOutletAndPriceList() throws Exception {
        Configuration configuration = new Configuration();
        try (var input = Resources.getResourceAsStream(RESOURCE)) {
            new XMLMapperBuilder(input, configuration, RESOURCE, configuration.getSqlFragments()).parse();
        }

        assertScoped(configuration, "listCatalog", Map.of("outletId", 41L));
        assertScoped(configuration, "searchCatalog", Map.of("outletId", 41L, "q", "Prosecco"));
        assertScoped(configuration, "findById", Map.of("outletId", 41L, "id", 10377L));

        Map<String, Object> missingOutlet = new HashMap<>();
        missingOutlet.put("outletId", null);
        assertScoped(configuration, "listCatalog", missingOutlet);
    }

    private static void assertScoped(Configuration configuration, String statement, Map<String, Object> parameters) {
        String sql = configuration.getMappedStatement(NAMESPACE + statement)
                .getBoundSql(parameters)
                .getSql()
                .replaceAll("\\s+", " ")
                .toLowerCase();
        assertTrue(sql.contains("and p.outlet_id = ?"), statement + " must not return another outlet's products");
        assertTrue(sql.contains("and pp.outlet_id = ?"), statement + " must price from the current outlet");
    }
}
