package com.orithos.modules.sell;

import com.orithos.common.BusinessException;
import com.orithos.modules.config.CompanySettingsKeys;
import com.orithos.modules.config.CompanySettingsService;
import com.orithos.modules.customer.mapper.CustomerMapper;
import com.orithos.modules.product.Product;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.modules.sale.Sale;
import com.orithos.modules.sale.SaleMapper;
import com.orithos.modules.sell.dto.ParkSaleRequest;
import com.orithos.modules.sell.dto.SellCartItem;
import com.orithos.security.AuthUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SellServiceParkedSaleNoteTest {
    private final ProductMapper products = mock(ProductMapper.class);
    private final CustomerMapper customers = mock(CustomerMapper.class);
    private final SaleMapper sales = mock(SaleMapper.class);
    private final CompanySettingsService companySettings = mock(CompanySettingsService.class);
    private final SellService service = new SellService(products, customers, sales, companySettings, true);

    @BeforeEach
    void authenticate() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "cashier", false, 12L, 3L), null, List.of()));
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void requiredParkedSaleNoteRejectsBlankBeforeWriting() {
        when(companySettings.getBoolean(CompanySettingsKeys.REQUIRE_NOTE_ON_PARKED_SALE, false)).thenReturn(true);

        assertThrows(BusinessException.class, () -> service.park(request("  ")));

        verify(products, never()).findSellableForOutlet(any(), any(), any(), any());
        verify(sales, never()).insert(any(Sale.class));
    }

    @Test
    void requiredParkedSaleNoteIsTrimmedAndStored() {
        when(companySettings.getBoolean(CompanySettingsKeys.REQUIRE_NOTE_ON_PARKED_SALE, false)).thenReturn(true);
        Product product = product();
        when(products.findSellableForOutlet(101L, 3L, 12L, BigDecimal.ONE)).thenReturn(product);
        when(sales.insert(any(Sale.class))).thenAnswer(invocation -> {
            ((Sale) invocation.getArgument(0)).setId(201L);
            return 1;
        });
        when(sales.findItemsBySaleId(201L)).thenReturn(List.of());

        service.park(request("  Customer return follow-up  "));

        org.mockito.ArgumentCaptor<Sale> saved = org.mockito.ArgumentCaptor.forClass(Sale.class);
        verify(sales).insert(saved.capture());
        assertEquals("Customer return follow-up", saved.getValue().getNote());
    }

    @Test
    void parkedSaleNoteRemainsOptionalWhenSettingIsDisabled() {
        when(companySettings.getBoolean(CompanySettingsKeys.REQUIRE_NOTE_ON_PARKED_SALE, false)).thenReturn(false);
        Product product = product();
        when(products.findSellableForOutlet(101L, 3L, 12L, BigDecimal.ONE)).thenReturn(product);
        when(sales.insert(any(Sale.class))).thenAnswer(invocation -> {
            ((Sale) invocation.getArgument(0)).setId(202L);
            return 1;
        });
        when(sales.findItemsBySaleId(202L)).thenReturn(List.of());

        service.park(request(" "));

        org.mockito.ArgumentCaptor<Sale> saved = org.mockito.ArgumentCaptor.forClass(Sale.class);
        verify(sales).insert(saved.capture());
        assertEquals(null, saved.getValue().getNote());
    }

    private static ParkSaleRequest request(String note) {
        SellCartItem item = new SellCartItem();
        item.setProductId(101L);
        item.setQuantity(BigDecimal.ONE);
        ParkSaleRequest request = new ParkSaleRequest();
        request.setRegisterId(11L);
        request.setNote(note);
        request.setItems(List.of(item));
        return request;
    }

    private static Product product() {
        Product product = new Product();
        product.setId(101L);
        product.setName("Test product");
        product.setPrice(new BigDecimal("12.00"));
        product.setCaseQuantity(BigDecimal.ONE);
        return product;
    }
}
