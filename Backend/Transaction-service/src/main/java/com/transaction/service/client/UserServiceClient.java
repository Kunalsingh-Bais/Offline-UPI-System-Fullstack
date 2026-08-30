package com.transaction.service.client;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.HashMap;
import java.util.Map;

@FeignClient(name = "User-service")
public interface UserServiceClient {

    @PostMapping("/user/wallet/update-balance")
    @CircuitBreaker(name = "userServiceCircuitBreaker", fallbackMethod = "updateBalanceFallback")
    Map<String, Object> updateBalance(@RequestBody Map<String, Object> request);

    @PostMapping("/user/profile/by-upi")
    @CircuitBreaker(name = "userServiceCircuitBreaker", fallbackMethod = "getProfileByUpiIdFallback")
    Map<String, Object> getProfileByUpiId(@RequestBody Map<String, Object> request);

    // --- Fallback for getProfileByUpiId ---
    default Map<String, Object> getProfileByUpiIdFallback(Map<String, Object> request, Exception ex) {
        Map<String, Object> fallbackResponse = new HashMap<>();
        fallbackResponse.put("success", false);
        fallbackResponse.put("message", "User Service unavailable - Cannot fetch profile");
        fallbackResponse.put("error", ex.getMessage());

        System.err.println("Circuit Breaker Fallback (getProfileByUpiId): " + ex.getMessage());

        return fallbackResponse;
    }

    // --- Fallback for updateBalance ---
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

    // --- Get user profile by UPI ID ---
    @GetMapping("/user/profile/by-upi/{upiId}")
    UserProfile getProfileByUPI(@PathVariable String upiId);

    // --- User profile response ---
    @NoArgsConstructor
    @AllArgsConstructor
    class UserProfile {
        @Getter
        public Integer profileId;
        @Getter
        public String upiId;
        @Getter
        public String name;
        @Getter
        public String email;
        public String phoneNumber;
    }
}