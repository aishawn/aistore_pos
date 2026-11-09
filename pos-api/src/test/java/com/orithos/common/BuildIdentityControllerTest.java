package com.orithos.common;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BuildIdentityControllerTest {
    @Test
    void uatContextRequiresActualIsolatedPosDatabaseAndIsolatedOdooDatabase() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject("select current_database()", String.class)).thenReturn("pos_demo_uat");
        BuildIdentityController controller = new BuildIdentityController(jdbc);
        ReflectionTestUtils.setField(controller, "environment", "uat");
        ReflectionTestUtils.setField(controller, "database", "odoo_demo_uat");
        ReflectionTestUtils.setField(controller, "isolationOdooDatabase", "odoo_demo_uat");
        ReflectionTestUtils.setField(controller, "runtimeEnvironment", "uat");
        ReflectionTestUtils.setField(controller, "expectedPosDatabase", "pos_demo_uat");
        ReflectionTestUtils.setField(controller, "isolationPosDatabase", "pos_demo_uat");

        Map<String, Object> verified = controller.uatContext().getBody();
        assertNotNull(verified);
        assertEquals(true, verified.get("isolated"));
        assertEquals(true, verified.get("posDatabaseVerified"));
        assertEquals(true, verified.get("posDatabaseIsolated"));
        assertFalse(verified.containsKey("database"));

        when(jdbc.queryForObject("select current_database()", String.class)).thenReturn("pos_production");
        Map<String, Object> wrongDatabase = controller.uatContext().getBody();
        assertNotNull(wrongDatabase);
        assertEquals(false, wrongDatabase.get("isolated"));
        assertEquals(false, wrongDatabase.get("posDatabaseVerified"));
    }

    @Test
    void productionContextDoesNotClaimIsolation() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject("select current_database()", String.class)).thenReturn("pos_production");
        BuildIdentityController controller = new BuildIdentityController(jdbc);
        ReflectionTestUtils.setField(controller, "environment", "production");
        ReflectionTestUtils.setField(controller, "database", "odoo_production");
        ReflectionTestUtils.setField(controller, "isolationOdooDatabase", "odoo_uat");
        ReflectionTestUtils.setField(controller, "runtimeEnvironment", "production");
        ReflectionTestUtils.setField(controller, "expectedPosDatabase", "pos_production");
        ReflectionTestUtils.setField(controller, "isolationPosDatabase", "");

        Map<String, Object> result = controller.uatContext().getBody();
        assertNotNull(result);
        assertEquals(false, result.get("isolated"));
        assertEquals(true, result.get("posDatabaseVerified"));
        assertEquals(false, result.get("posDatabaseIsolated"));
    }

    @Test
    void sharedPostgresDatabaseCannotBeReportedAsIsolatedUat() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject("select current_database()", String.class)).thenReturn("postgres");
        BuildIdentityController controller = new BuildIdentityController(jdbc);
        ReflectionTestUtils.setField(controller, "environment", "uat");
        ReflectionTestUtils.setField(controller, "database", "odoo_demo_uat");
        ReflectionTestUtils.setField(controller, "isolationOdooDatabase", "odoo_demo_uat");
        ReflectionTestUtils.setField(controller, "runtimeEnvironment", "uat");
        ReflectionTestUtils.setField(controller, "expectedPosDatabase", "postgres");
        ReflectionTestUtils.setField(controller, "isolationPosDatabase", "postgres");

        Map<String, Object> result = controller.uatContext().getBody();
        assertNotNull(result);
        assertEquals(false, result.get("isolated"));
        assertEquals(true, result.get("posDatabaseVerified"));
        assertEquals(false, result.get("posDatabaseIsolated"));
    }
}
