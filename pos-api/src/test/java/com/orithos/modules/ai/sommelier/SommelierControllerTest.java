package com.orithos.modules.ai.sommelier;

import com.orithos.common.BusinessException;
import com.orithos.modules.ai.report.TenantContextFactory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class SommelierControllerTest {

    @Test
    @SuppressWarnings("unchecked")
    void labelPhotoFailsClosedWhenAiIsDisabledBeforeResolvingVisionProvider() {
        SommelierService sommelier = mock(SommelierService.class);
        TenantContextFactory tenants = mock(TenantContextFactory.class);
        ObjectProvider<WineLabelVisionService> vision = mock(ObjectProvider.class);
        SommelierController controller = new SommelierController(sommelier, tenants, vision);

        BusinessException error = assertThrows(BusinessException.class,
                () -> controller.identifyImage(new MockMultipartFile(
                        "file", "label.jpg", "image/jpeg", new byte[]{1, 2, 3})));

        assertEquals(50301, error.getCode());
        verifyNoInteractions(vision, sommelier, tenants);
        // The default is deliberately false; a disabled capability must not even
        // resolve a provider bean or touch tenant-scoped catalogue data.
        assertEquals(false, ReflectionTestUtils.getField(controller, "aiEnabled"));
    }
}
