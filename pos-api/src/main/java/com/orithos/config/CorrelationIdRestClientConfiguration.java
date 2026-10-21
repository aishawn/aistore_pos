package com.orithos.config;

import org.springframework.boot.web.client.RestClientCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class CorrelationIdRestClientConfiguration {

    @Bean
    RestClientCustomizer correlationIdRestClientCustomizer() {
        return builder -> builder.requestInterceptor(new CorrelationIdClientHttpRequestInterceptor());
    }
}
