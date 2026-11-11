package com.orithos.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PostgresqlUrlEnvironmentPostProcessorTest {
    @Test
    void preservesPlusInUriCredentials() {
        MockEnvironment environment = new MockEnvironment()
                .withProperty("POSTGRESQL_URL", "postgresql://pos+user:pass+word@db.example:5432/postgres?sslmode=require");

        new PostgresqlUrlEnvironmentPostProcessor().postProcessEnvironment(environment, new SpringApplication());

        assertEquals(
                "jdbc:postgresql://db.example:5432/postgres?user=pos%2Buser&password=pass%2Bword&sslmode=require",
                environment.getProperty("POSTGRESQL_JDBC_URL"));
    }
}
