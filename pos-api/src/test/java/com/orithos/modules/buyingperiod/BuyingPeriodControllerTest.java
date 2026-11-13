package com.orithos.modules.buyingperiod;

import com.orithos.common.BusinessException;
import com.orithos.modules.product.Product;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.security.AuthUser;
import com.orithos.security.PermissionAccess;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class BuyingPeriodControllerTest {
    private BuyingPeriodMapper mapper;
    private ProductMapper productMapper;
    private PermissionAccess permissions;
    private BuyingPeriodController controller;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(8L, "cashier", false, 87L, 55L), null));
        mapper = mock(BuyingPeriodMapper.class);
        productMapper = mock(ProductMapper.class);
        permissions = mock(PermissionAccess.class);
        controller = new BuyingPeriodController(mapper, productMapper, permissions);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void createForcesCurrentOutletAndRejectsProductFromAnotherOutlet() {
        BuyingPeriod period = new BuyingPeriod();
        period.setOutletId(1L);
        period.setItemType("product");
        period.setItemId(900L);
        when(productMapper.findByIdAndOutlet(900L, 55L, 87L)).thenReturn(null);

        assertThrows(BusinessException.class, () -> controller.create(period));

        verify(mapper, never()).insert(any());
    }

    @Test
    void createUsesCurrentOutletAndChecksProductOwnership() {
        BuyingPeriod period = new BuyingPeriod();
        period.setOutletId(1L);
        period.setItemType("PRODUCT");
        period.setItemId(900L);
        when(productMapper.findByIdAndOutlet(900L, 55L, 87L)).thenReturn(new Product());

        controller.create(period);

        assertEquals(87L, period.getOutletId());
        verify(permissions).requirePermission("stock.purchases");
        verify(mapper).insert(period);
    }

    @Test
    void updateRejectsRecordOutsideCurrentOutletBeforeWriting() {
        when(mapper.findByIdAndOutlet(12L, 87L)).thenReturn(null);

        assertThrows(BusinessException.class, () -> controller.update(12L, new BuyingPeriod()));

        verify(mapper, never()).update(any(), eq(87L));
    }

    @Test
    void deleteRejectsRecordOutsideCurrentOutletBeforeDeleting() {
        when(mapper.findByIdAndOutlet(12L, 87L)).thenReturn(null);

        assertThrows(BusinessException.class, () -> controller.delete(12L));

        verify(mapper, never()).delete(12L, 87L);
    }
}
