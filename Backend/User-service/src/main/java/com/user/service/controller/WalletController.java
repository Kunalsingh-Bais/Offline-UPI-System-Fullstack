package com.user.service.controller;

import com.user.service.dto.GetBalanceResponse;
import com.user.service.dto.UpdateBalanceRequest;
import com.user.service.dto.UpdateBalanceResponse;
import com.user.service.service.WalletService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;

@RestController
@RequestMapping("/user/wallet")
public class WalletController {

    @Autowired
    private WalletService walletService;

    // ------ GET = /user/wallet/balance/{profileId} ------
    @GetMapping("/balance/{profileId}")
    public ResponseEntity<GetBalanceResponse> getBalance(@PathVariable Integer profileId) {
        try {
            GetBalanceResponse response = walletService.getBalance(profileId);

            if (response.isSuccess()) {   // 200 OK - Balance retrieved
                return ResponseEntity.ok(response);
            }
            else {
                // 404 Not Found - Wallet not found
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(response);
            }
        }
        catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new GetBalanceResponse(null,profileId,null,null,"INR",false,"Error: "+e.getMessage()));
        }
    }

    // ------ POST = /user/wallet/update-balance ------
    @PostMapping("/update-balance")
    public ResponseEntity<UpdateBalanceResponse> updateBalance(@RequestBody UpdateBalanceRequest request) {
        UpdateBalanceResponse response = walletService.updateBalance(request);
        // 200 OK - Balance updated
        return ResponseEntity.ok(response);
    }
}
