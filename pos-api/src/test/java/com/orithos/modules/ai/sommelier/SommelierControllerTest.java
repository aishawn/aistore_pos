package com.orithos.modules.ai.sommelier;

import com.orithos.common.BusinessException;
import com.orithos.modules.ai.AiProviderQuotaService;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.report.TenantContextFactory;
import com.orithos.modules.ai.sommelier.dto.RecommendRequest;
import com.orithos.modules.ai.sommelier.dto.SimilarRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class SommelierControllerTest {

    @Test
    @SuppressWarnings("unchecked")
    void deterministicRecommendationDoesNotConsumeProviderQuota() {
        SommelierService sommelier = mock(SommelierService.class);
        TenantContextFactory tenants = mock(TenantContextFactory.class);
        ObjectProvider<WineLabelVisionService> vision = mock(ObjectProvider.class);
        AiProviderQuotaService quota = mock(AiProviderQuotaService.class);
        TenantContext tenant = new TenantContext(55L, 7L, 87L, List.of(87L), Set.of(TenantContext.PERM_QUERY));
        RecommendRequest request = new RecommendRequest(
                "red", BigDecimal.ZERO, new BigDecimal("40"), 0.5, 0.5, 0.5, 0.5, 0.5,
                List.of(), "dinner");
        when(tenants.fromSecurity()).thenReturn(tenant);
        SommelierController controller = new SommelierController(sommelier, tenants, vision, quota);

        controller.recommend(request);

        verify(tenants).fromSecurity();
        verify(sommelier).recommend(request, tenant);
        verifyNoInteractions(quota);
    }

    @Test
    @SuppressWarnings("unchecked")
    void deterministicSimilarWineLookupDoesNotConsumeProviderQuota() {
        SommelierService sommelier = mock(SommelierService.class);
        TenantContextFactory tenants = mock(TenantContextFactory.class);
        ObjectProvider<WineLabelVisionService> vision = mock(ObjectProvider.class);
        AiProviderQuotaService quota = mock(AiProviderQuotaService.class);
        TenantContext tenant = new TenantContext(55L, 7L, 87L, List.of(87L), Set.of(TenantContext.PERM_QUERY));
        SimilarRequest request = new SimilarRequest(123L, "cheaper");
        when(tenants.fromSecurity()).thenReturn(tenant);
        SommelierController controller = new SommelierController(sommelier, tenants, vision, quota);

        controller.similar(request);

        verify(tenants).fromSecurity();
        verify(sommelier).similar(request, tenant);
        verifyNoInteractions(quota);
    }

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
