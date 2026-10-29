package com.orithos.modules.ai.command;

import com.orithos.modules.customer.mapper.CustomerMapper;
import com.orithos.modules.product.Product;
import com.orithos.modules.product.mapper.ProductMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.*;

class AiCommandTargetResolverTest {
    @Test
    void resolvesUniqueProductUsingServerValues() {
        ProductMapper products = mock(ProductMapper.class);
        CustomerMapper customers = mock(CustomerMapper.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        Product product = new Product();
        product.setId(123L);
        product.setName("VB Cans");
        when(products.countActiveByName("VB Cans")).thenReturn(1L);
        when(products.findActiveByName("VB Cans")).thenReturn(product);

        AiCommandTargetResolver.Resolution result = new AiCommandTargetResolver(products, customers, jdbc)
                .resolve(AiCommandType.UPDATE_PRODUCT,
                        List.of(new AiCommandDtos.ParsedItem(null, "VB Cans", "displayName",
                                "tampered", "Victoria Bitter", "exact name")));

        assertEquals(1, result.items().size());
        assertEquals(123L, result.items().get(0).id());
        assertEquals("VB Cans", result.items().get(0).before());
        assertEquals("Victoria Bitter", result.items().get(0).after());
        assertNull(result.items().get(0).exclusionReason());
    }

    @Test
    void rejectsAmbiguousProductWithoutGuessing() {
        ProductMapper products = mock(ProductMapper.class);
        when(products.countActiveByName("Shiraz")).thenReturn(2L);

        AiCommandTargetResolver.Resolution result = new AiCommandTargetResolver(products, mock(CustomerMapper.class), mock(JdbcTemplate.class))
                .resolve(AiCommandType.UPDATE_PRODUCT,
                        List.of(new AiCommandDtos.ParsedItem(null, "Shiraz", "displayName", null, "New", null)));

        assertEquals(0, result.items().size());
        assertEquals(1, result.excludedItems().size());
        assertEquals("Multiple products matched; clarification is required",
                result.excludedItems().get(0).exclusionReason());
        verify(products, never()).findActiveByName("Shiraz");
    }
}
