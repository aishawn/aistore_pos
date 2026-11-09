package com.orithos.modules.order;

import com.orithos.common.BusinessException;
import com.orithos.config.NativePosGate;
import com.orithos.modules.ai.invoice.InvoiceScanService;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

class OrderControllerNativeWriteGateTest {
    @Test
    void transferCreationIsRejectedBeforeTheOrderServiceRunsWhenNativeLedgerIsDisabled() {
        OrderMapper mapper = mock(OrderMapper.class);
        OrderService service = mock(OrderService.class);
        InvoiceScanService invoiceScanService = mock(InvoiceScanService.class);
        NativePosGate gate = mock(NativePosGate.class);
        doThrow(new BusinessException(40300, "Native Orithos POS is not enabled for this store."))
                .when(gate).requireEnabled();
        OrderController controller = new OrderController(mapper, service, invoiceScanService, gate);

        BusinessException denied = assertThrows(BusinessException.class,
                () -> controller.createTransfer(new CreateTransferRequest()));

        assertEquals(40300, denied.getCode());
        verify(gate).requireEnabled();
        verifyNoInteractions(service);
    }

    @Test
    void purchaseReceiptIsRejectedBeforeInventoryServiceRunsWhenNativeLedgerIsDisabled() {
        OrderMapper mapper = mock(OrderMapper.class);
        OrderService service = mock(OrderService.class);
        InvoiceScanService invoiceScanService = mock(InvoiceScanService.class);
        NativePosGate gate = mock(NativePosGate.class);
        doThrow(new BusinessException(40300, "Native Orithos POS is not enabled for this store."))
                .when(gate).requireEnabled();
        OrderController controller = new OrderController(mapper, service, invoiceScanService, gate);

        BusinessException denied = assertThrows(BusinessException.class, () ->
                controller.receiveLines(42L, "receipt-1", new PurchaseReceiptRequest(null)));

        assertEquals(40300, denied.getCode());
        verify(gate).requireEnabled();
        verifyNoInteractions(service);
    }
}
