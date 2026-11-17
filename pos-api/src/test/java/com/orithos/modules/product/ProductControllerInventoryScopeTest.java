package com.orithos.modules.product;

import com.orithos.common.BusinessException;
import com.orithos.modules.product.mapper.ProductCompetitionPriceMapper;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.security.AuthUser;
import org.apache.ibatis.annotations.Update;
import org.apache.ibatis.annotations.Select;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.lang.reflect.Method;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProductControllerInventoryScopeTest {
    private static final long PRODUCT_ID = 41L;
    private static final long VENDOR_ID = 7L;
    private static final long OUTLET_ID = 70L;

    private ProductMapper mapper;
    private ProductController controller;

    @BeforeEach
    void setUp() {
        mapper = mock(ProductMapper.class);
        controller = new ProductController(mapper, mock(ProductService.class),
                mock(ProductCompetitionPriceMapper.class), mock(ProductImportService.class),
                mock(ProductActivityService.class));
        var principal = new AuthUser(9L, "tenant-user", false, OUTLET_ID, VENDOR_ID);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, List.of()));
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void inventoryReadRejectsProductOwnedByAnotherVendor() {
        when(mapper.findByIdAndVendor(PRODUCT_ID, VENDOR_ID)).thenReturn(null);

        assertThrows(BusinessException.class, () -> controller.listInventory(PRODUCT_ID));

        verify(mapper, never()).findInventoryByProductId(PRODUCT_ID, VENDOR_ID);
    }

    @Test
    void productDetailLookupUsesAuthenticatedVendor() {
        when(mapper.findByIdAndVendor(PRODUCT_ID, VENDOR_ID)).thenReturn(null);

        controller.get(PRODUCT_ID);

        verify(mapper).findByIdAndVendor(PRODUCT_ID, VENDOR_ID);
        verify(mapper, never()).findById(PRODUCT_ID);
    }

    @Test
    void inventoryAdjustmentRejectsProductOwnedByAnotherVendor() {
        when(mapper.findByIdAndVendor(PRODUCT_ID, VENDOR_ID)).thenReturn(null);

        assertThrows(BusinessException.class, () -> controller.adjustInventory(PRODUCT_ID,
                new ProductController.AdjustInventoryRequest(OUTLET_ID, BigDecimal.ONE)));

        verify(mapper, never()).adjustInventoryForVendor(PRODUCT_ID, VENDOR_ID, OUTLET_ID, BigDecimal.ONE);
    }

    @Test
    void inventoryReplacementRejectsProductOwnedByAnotherVendor() {
        when(mapper.findByIdAndVendor(PRODUCT_ID, VENDOR_ID)).thenReturn(null);

        assertThrows(BusinessException.class, () -> controller.setInventory(PRODUCT_ID,
                new ProductController.SetInventoryRequest(List.of(new ProductController.InventoryRow(
                        OUTLET_ID, BigDecimal.TEN, null, null, null, null, null)))));

        verify(mapper, never()).upsertInventoryForVendor(org.mockito.ArgumentMatchers.eq(PRODUCT_ID),
                org.mockito.ArgumentMatchers.eq(VENDOR_ID), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void inventoryAdjustmentRejectsOutletOutsideVendor() {
        when(mapper.findByIdAndVendor(PRODUCT_ID, VENDOR_ID)).thenReturn(new Product());
        when(mapper.adjustInventoryForVendor(PRODUCT_ID, VENDOR_ID, 999L, BigDecimal.ONE)).thenReturn(0);

        assertThrows(BusinessException.class, () -> controller.adjustInventory(PRODUCT_ID,
                new ProductController.AdjustInventoryRequest(999L, BigDecimal.ONE)));
    }

    @Test
    void inventoryReplacementRejectsOutletOutsideVendor() {
        when(mapper.findByIdAndVendor(PRODUCT_ID, VENDOR_ID)).thenReturn(new Product());
        when(mapper.upsertInventoryForVendor(org.mockito.ArgumentMatchers.eq(PRODUCT_ID),
                org.mockito.ArgumentMatchers.eq(VENDOR_ID), org.mockito.ArgumentMatchers.any())).thenReturn(0);

        assertThrows(BusinessException.class, () -> controller.setInventory(PRODUCT_ID,
                new ProductController.SetInventoryRequest(List.of(new ProductController.InventoryRow(
                        999L, BigDecimal.TEN, null, null, null, null, null)))));
    }

    @Test
    void inventoryAdjustmentSqlRequiresMatchingVendor() throws Exception {
        assertVendorBoundWriteSql("adjustInventoryForVendor");
    }

    @Test
    void inventoryUpsertSqlRequiresMatchingVendor() throws Exception {
        assertVendorBoundWriteSql("upsertInventoryForVendor");
    }

    @Test
    void inventoryReadSqlReturnsOnlyVendorOutlets() throws Exception {
        Method method = List.of(ProductMapper.class.getDeclaredMethods()).stream()
                .filter(candidate -> candidate.getName().equals("findInventoryByProductId"))
                .findFirst()
                .orElseThrow();
        assertTrue(String.join(" ", method.getAnnotation(Select.class).value()).contains("o.vendor_id = #{vendorId}"));
    }

    @Test
    void inventoryTotalSqlExcludesOtherVendors() throws Exception {
        Method method = List.of(ProductMapper.class.getDeclaredMethods()).stream()
                .filter(candidate -> candidate.getName().equals("sumInventoryByProductId"))
                .findFirst()
                .orElseThrow();
        assertTrue(String.join(" ", method.getAnnotation(Select.class).value()).contains("vendor_id = #{vendorId}"));
    }

    private static void assertVendorBoundWriteSql(String methodName) throws Exception {
        String sql = updateSql(methodName);
        assertTrue(sql.contains("owner.vendor_id=#{vendorId}"));
        assertTrue(sql.contains("target.vendor_id=#{vendorId}"));
    }

    private static String updateSql(String methodName) throws Exception {
        Method method = List.of(ProductMapper.class.getDeclaredMethods()).stream()
                .filter(candidate -> candidate.getName().equals(methodName))
                .findFirst()
                .orElseThrow();
        return String.join(" ", method.getAnnotation(Update.class).value());
    }
}
