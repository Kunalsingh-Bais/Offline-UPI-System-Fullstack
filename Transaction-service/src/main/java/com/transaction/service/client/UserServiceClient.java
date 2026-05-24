package com.transaction.service.client;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.HashMap;
import java.util.Map;

@FeignClient(name = "User-service")
public interface UserServiceClient {

    @PostMapping("/user/wallet/update-balance")
    @CircuitBreaker(name = "userServiceCircuitBreaker", fallbackMethod = "updateBalanceFallback")
    Map<String, Object> updateBalance(@RequestBody Map<String, Object> request);

    default Map<String, Object> updateBalanceFallback(Map<String, Object> request, Exception ex) {
        Map<String, Object> fallbackResponse = new HashMap<>();
        fallbackResponse.put("success", false);
        fallbackResponse.put("message", "User Service unavailable - Circuit breaker opened. Please try again later.");
        fallbackResponse.put("profileId", request.get("profileId"));
        fallbackResponse.put("newBalance", null);
        fallbackResponse.put("error", ex.getMessage());

        System.err.println("Circuit Breaker Fallback Triggered: " + ex.getMessage());

        return fallbackResponse;
    }
}
