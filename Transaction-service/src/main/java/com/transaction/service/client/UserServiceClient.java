package com.transaction.service.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.Map;

@FeignClient(name = "User-service")
public interface UserServiceClient {

    @PostMapping("/user/wallet/update-balance")
    Map<String, Object> updateBalance(@RequestBody Map<String, Object> request);
}
