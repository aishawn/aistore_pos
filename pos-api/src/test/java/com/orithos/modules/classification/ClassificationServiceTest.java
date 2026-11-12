package com.orithos.modules.classification;

import com.orithos.modules.classification.mapper.ClassificationMapper;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.security.AuthUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ClassificationServiceTest {

    private ClassificationMapper mapper;
    private ProductMapper productMapper;
    private ClassificationService service;

    @BeforeEach
    void setUp() {
        mapper = mock(ClassificationMapper.class);
        productMapper = mock(ProductMapper.class);
        service = new ClassificationService(mapper, productMapper);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(1L, "staff", true, 3L, 7L), null));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void listSetsTypeAndZeroPerformanceWhenNoSales() {
        Classification row = new Classification();
        row.setId(13L);
        row.setName("GROCERIES");
        row.setProductCount(79);
        when(mapper.list(eq(ClassificationType.CATEGORY), isNull(), eq(3L))).thenReturn(List.of(row));
        when(mapper.categorySalesByDay(eq(List.of(13L)), eq(3L), any(), any())).thenReturn(List.of());

        List<Classification> items = service.list("category", null);

        assertEquals(1, items.size());
        assertEquals("category", items.get(0).getType());
        assertNotNull(items.get(0).getPerformance30d());
        assertEquals(30, items.get(0).getPerformance30d().size());
        assertEquals(0, items.get(0).getPerformance30d().get(0).compareTo(BigDecimal.ZERO.setScale(2)));
    }

    @Test
    void listSurvivesPerformanceQueryFailure() {
        Classification row = new Classification();
        row.setId(18L);
        row.setName("BAKERY");
        when(mapper.list(eq(ClassificationType.CATEGORY), isNull(), eq(3L))).thenReturn(List.of(row));
        when(mapper.categorySalesByDay(eq(List.of(18L)), eq(3L), any(), any()))
                .thenThrow(new RuntimeException("boom"));

        List<Classification> items = service.list("category", null);

        assertEquals(1, items.size());
        assertEquals("BAKERY", items.get(0).getName());
        assertNotNull(items.get(0).getPerformance30d());
        assertEquals(30, items.get(0).getPerformance30d().size());
    }

    @Test
    void createPersistsOutletScopedRow() {
        when(mapper.insert(eq("brand"), any(Classification.class), eq(3L))).thenAnswer(invocation -> {
            Classification c = invocation.getArgument(1);
            c.setId(99L);
            return 1;
        });

        Classification body = new Classification();
        body.setName("  Local Brand  ");
        Classification created = service.create("brand", body);

        assertEquals(99L, created.getId());
        assertEquals("Local Brand", created.getName());
        assertEquals("brand", created.getType());
        assertEquals(0, created.getProductCount());
        verify(mapper).insert(eq("brand"), any(Classification.class), eq(3L));
    }

    @Test
    void deleteRequiresNoLinkedProducts() {
        Classification existing = new Classification();
        existing.setId(5L);
        existing.setName("BAKERY");
        when(mapper.findVisible(ClassificationType.CATEGORY, 5L, 3L)).thenReturn(existing);
        when(mapper.countProducts(ClassificationType.CATEGORY, 5L, 3L)).thenReturn(0);

        service.delete("category", 5L);

        verify(mapper).softDeleteById("category", 5L);
    }
}
