package com.orithos.modules.report;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.mock;

class ReportQueryServiceSpringInjectionTest {

    @Test
    void springUsesTheJdbcTemplateConstructorWhenTestConstructorsAlsoExist() {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.registerBean(JdbcTemplate.class, () -> mock(JdbcTemplate.class));
            context.register(ReportQueryService.class);

            context.refresh();

            assertNotNull(context.getBean(ReportQueryService.class));
        }
    }
}
