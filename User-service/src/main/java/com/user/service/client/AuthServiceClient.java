package com.user.service.client;

import com.user.service.dto.ValidateTokenRequest;
import com.user.service.dto.ValidateTokenResponse;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "Auth-service")
public interface AuthServiceClient {

    // Call auth-service's validate-token endpoint
    @PostMapping("/auth/validate-token")
    ValidateTokenResponse validateToken(@RequestBody ValidateTokenRequest request);
}
