package com.auth.service.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.client.RestTemplate;


import java.util.Arrays;

@Configuration      // This is a configuration class
public class AppConfig {

    // ------ PASSWORD ENCODER ------
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
        // BCrypt: Auto-generates salt, hard to crack
        // "Pass123" → "$2a$10$kR.CvGchsDjf..." (different every time!)
    }

    // ------ REST TEMPLATE (For calling  other services) ------
    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
        // Allows auth-service to call user-service, transaction-service, etc.
        // RestTemplate.getForObject("http://user-service/balance", ...)
    }

    // ------ CORS CONFIGURATION ------
    /*@Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();

        // Allow requests from these origins
        configuration.setAllowedOrigins(Arrays.asList(
                "http://localhost:4200",    // Angular frontend
                "http://localhost:3000",
                "http://localhost:8080"    // API gateway
        ));

        // Allow these HTTP methods
        configuration.setAllowedMethods(Arrays.asList(
                "GET", "POST", "PUT", "DELETE", "OPTIONS"
        ));

        // Allow these headers
        configuration.setAllowedHeaders(Arrays.asList("*"));

        // Allow credentials (cookies, auth headers)
        configuration.setAllowCredentials(true);

        // Cache CORS response for 1 hour
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**",configuration);     // Apply to all endpoints

        return source;
    }*/

}
