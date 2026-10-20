package com.orithos.modules.ai.invoice;

import com.orithos.common.BusinessException;
import com.orithos.modules.order.OrderService;
import com.orithos.modules.product.ProductMapper;
import com.orithos.modules.product.ProductService;
import com.orithos.modules.register.OutletMapper;
import com.orithos.modules.supplier.SupplierMapper;
import com.orithos.modules.supplier.SupplierService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class InvoiceScanServiceTest {

    @Test
    void scannedReceiveSaveFailsClosedWithoutCallingWriteDependencies() {
        ObjectProvider<InvoiceVisionService> vision = mock(ObjectProvider.class);
        SupplierMapper supplierMapper = mock(SupplierMapper.class);
        SupplierService supplierService = mock(SupplierService.class);
        ProductMapper productMapper = mock(ProductMapper.class);
        ProductService productService = mock(ProductService.class);
        OutletMapper outletMapper = mock(OutletMapper.class);
        OrderService orderService = mock(OrderService.class);

        InvoiceScanService service = new InvoiceScanService(
                vision,
                supplierMapper,
                supplierService,
                productMapper,
                productService,
                outletMapper,
                orderService);

        assertThrows(BusinessException.class, () -> service.save(new InvoiceScanResponse()));

        verifyNoInteractions(vision, supplierMapper, supplierService, productMapper,
                productService, outletMapper, orderService);
    }
}
