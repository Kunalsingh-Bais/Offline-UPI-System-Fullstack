package com.transaction.service.client;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.UUID;

@FeignClient(name = "User-service", contextId = "walletServiceClient")
public interface WalletServiceClient {

    // --- Get current balance of a user ---
    @GetMapping("user/wallet/balance/{profileId}")
    GetBalanceResponse getBalance(@PathVariable Integer profileId);

    @PostMapping("/user/wallet/update-balance")
    UpdateBalanceResponse updateBalance(@RequestBody UpdateBalanceRequest request);

    // --- Debit amount from user wallet ---
    default WalletResponse debitWallet(Integer profileId, BigDecimal amount, String description) {
        UpdateBalanceRequest req = new UpdateBalanceRequest(profileId, amount, "DEBIT", UUID.randomUUID().toString(), description);
        UpdateBalanceResponse res = updateBalance(req);
        return new WalletResponse(
                res != null && res.isSuccess(),
                res != null ? res.getMessage() : "Unknown error",
                res != null ? res.getNewBalance() : null
        );
    }

    // --- Credit amount to user wallet ---
    default WalletResponse creditWallet(Integer profileId, BigDecimal amount, String description) {
        UpdateBalanceRequest req = new UpdateBalanceRequest(profileId, amount, "CREDIT", UUID.randomUUID().toString(), description);
        UpdateBalanceResponse res = updateBalance(req);
        return new WalletResponse(
                res != null && res.isSuccess(),
                res != null ? res.getMessage() : "Unknown error",
                res != null ? res.getNewBalance() : null
        );
    }

    @AllArgsConstructor
    @NoArgsConstructor
    class GetBalanceResponse {
        @Getter
        public BigDecimal balance;
        @Getter
        private Integer profileId;
        @Getter
        private boolean success;
        @Getter
        private String message;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    class UpdateBalanceRequest {
        private Integer profileId;
        private BigDecimal amount;
        private String operation; // "DEBIT" or "CREDIT"
        private String transactionId;
        private String description;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    class UpdateBalanceResponse {
        private Integer walletId;
        private BigDecimal previousBalance;
        private BigDecimal newBalance;
        private BigDecimal amount;
        private String operation;
        private String transactionId;
        private boolean success;
        private String message;
    }

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
