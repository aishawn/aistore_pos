package com.orithos.modules.report;

import org.junit.jupiter.api.Test;
import com.orithos.common.BusinessTimezoneService;
import com.orithos.modules.config.CompanySettingsService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.mock;

class ReportQueryServiceSpringInjectionTest {

    @Test
    void springUsesTheJdbcTemplateConstructorWhenTestConstructorsAlsoExist() {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.registerBean(JdbcTemplate.class, () -> mock(JdbcTemplate.class));
            context.registerBean(BusinessTimezoneService.class, () -> mock(BusinessTimezoneService.class));
            context.registerBean(CompanySettingsService.class, () -> mock(CompanySettingsService.class));
            context.register(ReportQueryService.class);

            context.refresh();

            assertNotNull(context.getBean(ReportQueryService.class));
        }
    }
}
