package com.orithos.modules.ai.sommelier;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.ai.gateway.AiGateway;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.sommelier.dto.AskRequest;
import com.orithos.modules.ai.sommelier.dto.AskResponse;
import com.orithos.modules.ai.sommelier.mapper.SommelierProductMapper;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.ObjectProvider;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SommelierServiceChineseQuestionTest {

    @Test
    @SuppressWarnings("unchecked")
    void cheaperQuestionReturnsAnInStockLowerPricedAlternative() {
        SommelierCatalogService catalog = mock(SommelierCatalogService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        WineCandidate current = wine(1L, "Current Shiraz", "119.99");
        WineCandidate cheaper = wine(2L, "Value Shiraz", "79.99");
        when(catalog.findById(1L, tenant)).thenReturn(current);
        when(catalog.listWines(tenant)).thenReturn(List.of(current, cheaper));

        ObjectProvider<ChatClient> clients = mock(ObjectProvider.class);
        ObjectProvider<AiGateway> gatewayProvider = mock(ObjectProvider.class);
        WinePitchService pitch = new WinePitchService(clients, gatewayProvider);
        SommelierService service = new SommelierService(catalog, pitch,
                mock(SommelierProductMapper.class), new ObjectMapper());

        AskResponse response = service.ask(new AskRequest(1L, "有没有更便宜的吗？"), tenant);

        assertEquals(1, response.alternatives().size());
        assertEquals(2L, response.alternatives().get(0).productId());
        assertTrue(response.answer().contains("Value Shiraz"));
    }

    private static WineCandidate wine(long id, String name, String price) {
        return new WineCandidate(id, name, null, null, "WINE", null, null,
                new BigDecimal(price), new BigDecimal(price), false, BigDecimal.valueOf(3), true, null,
                new WineProfile("red", "Shiraz", null, null, 0.85, 0.9, 0.7, 0.65, 0.72,
                        List.of("Plum", "Spice", "Oak"), List.of("Dry", "Full Body", "Rich"),
                        List.of("steak", "lamb"), "Long, spicy finish", true));
    }
}
