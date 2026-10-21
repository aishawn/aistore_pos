package com.orithos.config;

import com.orithos.common.ApiResult;
import com.orithos.security.JwtAuthenticationFilter;
import com.orithos.tenant.TenantMatchFilter;
import com.orithos.tenant.TenantResolverFilter;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtFilter;
    private final TenantResolverFilter tenantResolverFilter;
    private final TenantMatchFilter tenantMatchFilter;
    private final OdooOnlyModeFilter odooOnlyModeFilter;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * Comma-separated list of allowed frontend origins. Configured via the
     * {@code app.cors.allowed-origins} property / {@code CORS_ALLOWED_ORIGINS}
     * env var. Defaults to the local Next.js dev server. Patterns are supported
     * (e.g. {@code https://*.your-domain.com}).
     */
    @Value("${app.cors.allowed-origins:http://localhost:3000}")
    private String allowedOrigins;

    public SecurityConfig(JwtAuthenticationFilter jwtFilter,
                          TenantResolverFilter tenantResolverFilter,
                          TenantMatchFilter tenantMatchFilter,
                          OdooOnlyModeFilter odooOnlyModeFilter) {
        this.jwtFilter = jwtFilter;
        this.tenantResolverFilter = tenantResolverFilter;
        this.tenantMatchFilter = tenantMatchFilter;
        this.odooOnlyModeFilter = odooOnlyModeFilter;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public RequestCorrelationFilter requestCorrelationFilter() {
        return new RequestCorrelationFilter();
    }

    /** Keep tenant/JWT filters only inside the Security chain (avoid double execution). */
    @Bean
    public FilterRegistrationBean<TenantResolverFilter> tenantResolverRegistration(
            TenantResolverFilter filter) {
        FilterRegistrationBean<TenantResolverFilter> reg = new FilterRegistrationBean<>(filter);
        reg.setEnabled(false);
        return reg;
    }

    @Bean
    public FilterRegistrationBean<TenantMatchFilter> tenantMatchRegistration(TenantMatchFilter filter) {
        FilterRegistrationBean<TenantMatchFilter> reg = new FilterRegistrationBean<>(filter);
        reg.setEnabled(false);
        return reg;
    }

    @Bean
    public FilterRegistrationBean<JwtAuthenticationFilter> jwtFilterRegistration(
            JwtAuthenticationFilter filter) {
        FilterRegistrationBean<JwtAuthenticationFilter> reg = new FilterRegistrationBean<>(filter);
        reg.setEnabled(false);
        return reg;
    }

    @Bean
    public FilterRegistrationBean<RequestCorrelationFilter> requestCorrelationRegistration(
            RequestCorrelationFilter filter) {
        FilterRegistrationBean<RequestCorrelationFilter> reg = new FilterRegistrationBean<>(filter);
        reg.setEnabled(false);
        return reg;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
                                           RequestCorrelationFilter requestCorrelationFilter) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(c -> c.configurationSource(corsSource()))
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(
                        "/api/auth/login",
                        "/api/auth/refresh",
                        "/api/auth/forgot-password",
                        "/api/auth/reset-password",
                        "/api/auth/reset-token",
                        "/api/auth/bootstrap",
                        "/api/public/**",
                        "/authorized").permitAll()
                .requestMatchers("/actuator/**", "/error").permitAll()
                .anyRequest().authenticated())
            .exceptionHandling(e -> e.authenticationEntryPoint((req, res, ex) -> {
                res.setStatus(HttpStatus.UNAUTHORIZED.value());
                res.setContentType("application/json;charset=UTF-8");
                res.getWriter().write(objectMapper.writeValueAsString(
                        ApiResult.fail(40100, "Unauthorized")));
            }))
            .addFilterBefore(requestCorrelationFilter, TenantResolverFilter.class)
            .addFilterBefore(tenantResolverFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(odooOnlyModeFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterAfter(tenantMatchFilter, JwtAuthenticationFilter.class);
        return http.build();
    }

    private CorsConfigurationSource corsSource() {
        List<String> origins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
        CorsConfiguration cfg = new CorsConfiguration();
        // setAllowedOriginPatterns (not setAllowedOrigins) so wildcards like
        // https://*.your-domain.com keep working alongside allowCredentials=true.
        cfg.setAllowedOriginPatterns(origins);
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("*"));
        cfg.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return source;
    }
}
