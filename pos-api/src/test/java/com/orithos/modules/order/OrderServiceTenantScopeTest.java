package com.orithos.modules.order;

import com.orithos.common.BusinessException;
import com.orithos.common.BusinessTimezoneService;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.modules.register.OutletMapper;
import com.orithos.modules.supplier.SupplierMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class OrderServiceTenantScopeTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void searchFailsClosedWithoutTenantContextBeforeQueryingMapper() {
        OrderMapper orders = mock(OrderMapper.class);
        OrderService service = new OrderService(
                orders, mock(OutletMapper.class), mock(SupplierMapper.class), mock(ProductMapper.class),
                mock(BusinessTimezoneService.class));

        BusinessException error = assertThrows(
                BusinessException.class, () -> service.search(new OrderListQuery()));

        assertEquals(40310, error.getCode());
        verifyNoInteractions(orders);
    }
}
