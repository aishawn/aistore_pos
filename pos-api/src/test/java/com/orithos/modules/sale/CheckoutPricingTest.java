package com.orithos.modules.sale;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.modules.payment.PaymentMethodMapper;
import com.orithos.modules.product.Product;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.modules.register.RegisterMapper;
import com.orithos.modules.register.RegisterSessionMapper;
import com.orithos.modules.sale.dto.CheckoutRequest;
import com.orithos.security.AuthUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CheckoutPricingTest {

    private final SaleMapper saleMapper = mock(SaleMapper.class);
    private final ProductMapper productMapper = mock(ProductMapper.class);
    private final CheckoutService service = new CheckoutService(saleMapper, mock(SalePaymentMapper.class),
            mock(PaymentMethodMapper.class), productMapper, mock(RegisterMapper.class),
            mock(RegisterSessionMapper.class), new ObjectMapper());

    @BeforeEach
    void authenticateOutlet() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "cashier", false, 12L, 3L), null, List.of()));
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void serverOutletPriceReplacesClientPriceAndLineTotal() {
        Product product = product("3.25");
        when(productMapper.findSellableForOutlet(42L, 3L, 12L, new BigDecimal("2"))).thenReturn(product);
        when(saleMapper.findTaxRateId(42L, 3L, 12L)).thenReturn(9L);
        when(saleMapper.findSellTaxPercent(42L, 3L, 12L)).thenReturn(new BigDecimal("10"));
        CheckoutRequest req = request(42L, "2", "999.00", "1998.00");

        service.prepareSellItems(req, 3L, 12L);

        assertEquals(new BigDecimal("3.25"), req.getItems().get(0).getUnitPrice());
        assertEquals(new BigDecimal("6.50"), req.getItems().get(0).getLineTotal());
        assertEquals("Outlet wine", req.getItems().get(0).getName());
        assertEquals(new BigDecimal("6.50"), CheckoutService.calculateTotal(req.getItems()));
    }

    @Test
    void productWithoutOutletPriceIsRejected() {
        when(productMapper.findSellableForOutlet(42L, 3L, 12L, BigDecimal.ONE)).thenReturn(product(null));

        assertThrows(BusinessException.class,
                () -> service.prepareSellItems(request(42L, "1", "0.01", null), 3L, 12L));
        verify(saleMapper, never()).findTaxRateId(anyLong(), anyLong(), anyLong());
    }

    @Test
    void productOutsideAuthenticatedOutletIsRejected() {
        when(productMapper.findSellableForOutlet(42L, 3L, 12L, BigDecimal.ONE)).thenReturn(null);

        assertThrows(BusinessException.class,
                () -> service.prepareSellItems(request(42L, "1", "0.01", null), 3L, 12L));
    }

    private static Product product(String price) {
        Product product = new Product();
        product.setId(42L);
        product.setName("Outlet wine");
        product.setPrice(price == null ? null : new BigDecimal(price));
        product.setCaseQuantity(new BigDecimal("6"));
        return product;
    }

    private static CheckoutRequest request(Long productId, String quantity, String price, String lineTotal) {
        CheckoutRequest.Item item = new CheckoutRequest.Item();
        item.setProductId(productId);
        item.setQuantity(new BigDecimal(quantity));
        item.setUnitPrice(new BigDecimal(price));
        if (lineTotal != null) item.setLineTotal(new BigDecimal(lineTotal));
        CheckoutRequest request = new CheckoutRequest();
        request.setItems(List.of(item));
        return request;
    }
}
