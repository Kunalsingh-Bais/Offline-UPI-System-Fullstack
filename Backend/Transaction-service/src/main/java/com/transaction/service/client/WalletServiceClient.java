package com.transaction.service.client;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.math.BigDecimal;

@FeignClient(name = "User-service", url = "${user-service.url:http://localhost:8081}")
public interface WalletServiceClient {

    // --- Get current balance of a user ---
    @GetMapping("/wallet/balance/{profileId}")
    BigDecimal getBalance(@PathVariable Integer profileId);

    // --- Debit amount from user wallet ---
    @PostMapping("/wallet/debit")
    WalletResponse debitWallet(
            @RequestParam Integer profileId,
            @RequestParam BigDecimal amount,
            @RequestParam String description
    );

    // --- Credit amount to user wallet ---
    @PostMapping("/wallet/credit")
    WalletResponse creditWallet(
            @RequestParam Integer profileId,
            @RequestParam BigDecimal amount,
            @RequestParam String description
    );

    // --- Response from Wallet service ---
    @AllArgsConstructor
    @NoArgsConstructor
    class WalletResponse {
        @Getter
        public boolean success;
        @Getter
        public String message;
        @Getter
        public BigDecimal newBalance;
    }
}
