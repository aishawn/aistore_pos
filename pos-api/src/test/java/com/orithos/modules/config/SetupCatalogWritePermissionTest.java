package com.orithos.modules.config;

import com.orithos.common.BusinessException;
import com.orithos.modules.customerdisplay.CustomerDisplayController;
import com.orithos.modules.customerdisplay.CustomerDisplayMapper;
import com.orithos.modules.payment.PaymentMethodController;
import com.orithos.modules.payment.PaymentMethodMapper;
import com.orithos.modules.pricing.PriceSetController;
import com.orithos.modules.pricing.PriceSetMapper;
import com.orithos.modules.promotion.PromotionCategoryController;
import com.orithos.modules.promotion.PromotionCategoryMapper;
import com.orithos.modules.salekeys.SaleKeysController;
import com.orithos.modules.salekeys.SaleKeysMapper;
import com.orithos.modules.tax.TaxRateController;
import com.orithos.modules.tax.TaxRateMapper;
import com.orithos.security.PermissionAccess;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class SetupCatalogWritePermissionTest {

    @Test
    void everySetupCatalogMutationRequiresStorePermissionBeforeMapperAccess() throws Exception {
        List<ControllerSpec> specs = List.of(
                new ControllerSpec(BarcodeTemplateController.class, BarcodeTemplateMapper.class),
                new ControllerSpec(ReceiptController.class, ReceiptMapper.class),
                new ControllerSpec(StatementController.class, StatementMapper.class),
                new ControllerSpec(TransfereeController.class, TransfereeMapper.class),
                new ControllerSpec(CustomerDisplayController.class, CustomerDisplayMapper.class),
                new ControllerSpec(PaymentMethodController.class, PaymentMethodMapper.class),
                new ControllerSpec(PriceSetController.class, PriceSetMapper.class),
                new ControllerSpec(PromotionCategoryController.class, PromotionCategoryMapper.class),
                new ControllerSpec(SaleKeysController.class, SaleKeysMapper.class),
                new ControllerSpec(TaxRateController.class, TaxRateMapper.class));

        for (ControllerSpec spec : specs) {
            Object mapper = mock(spec.mapperType());
            PermissionAccess permissions = mock(PermissionAccess.class);
            doThrow(new BusinessException(40300, "forbidden"))
                    .when(permissions).requirePermission("settings.store");
            Object controller = spec.controllerType()
                    .getConstructor(spec.mapperType(), PermissionAccess.class)
                    .newInstance(mapper, permissions);

            List<Method> mutations = java.util.Arrays.stream(spec.controllerType().getDeclaredMethods())
                    .filter(SetupCatalogWritePermissionTest::isMutation)
                    .toList();
            assertTrue(!mutations.isEmpty(), "Expected mutation handlers for " + spec.controllerType().getSimpleName());

            for (Method mutation : mutations) {
                clearInvocations(permissions, mapper);
                InvocationTargetException thrown = assertThrows(InvocationTargetException.class,
                        () -> mutation.invoke(controller, new Object[mutation.getParameterCount()]),
                        spec.controllerType().getSimpleName() + "." + mutation.getName());
                assertInstanceOf(BusinessException.class, thrown.getCause());
                verify(permissions).requirePermission("settings.store");
                verifyNoInteractions(mapper);
            }
        }
    }

    private static boolean isMutation(Method method) {
        return method.isAnnotationPresent(PostMapping.class)
                || method.isAnnotationPresent(PutMapping.class)
                || method.isAnnotationPresent(DeleteMapping.class);
    }

    private record ControllerSpec(Class<?> controllerType, Class<?> mapperType) {}
}
