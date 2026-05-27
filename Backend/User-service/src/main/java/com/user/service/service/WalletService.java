package com.user.service.service;

import com.user.service.Entity.Wallet;
import com.user.service.dto.GetBalanceResponse;
import com.user.service.dto.UpdateBalanceRequest;
import com.user.service.dto.UpdateBalanceResponse;
import com.user.service.repository.UserProfileRepository;
import com.user.service.repository.WalletRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Optional;

@Service
public class WalletService {

    @Autowired
    private WalletRepository walletRepository;

    @Autowired
    private UserProfileRepository userProfileRepository;

    // ------ GET BALANCE ------
    public GetBalanceResponse getBalance(Integer profileId) {
        try {
            // find wallet by profile ID
            Optional<Wallet> walletOpt = walletRepository.findByUserProfileId(profileId);

            if(walletOpt.isEmpty()) {
                return new GetBalanceResponse(null, profileId, null,null, "INR", false, "Wallet not found");
            }

            Wallet wallet = walletOpt.get();
            return new GetBalanceResponse(wallet.getId(), profileId, wallet.getUserProfile().getUpiId(),
                    wallet.getBalance(), "INR", true, "Balance retrieved");
        }
        catch (Exception e) {
            return new GetBalanceResponse(null, profileId, null, null, "INR", false, "Error: " +e.getMessage());
        }
    }

    // ------ UPDATE BALANCE (DEBIT or CREDIT) ------
    public UpdateBalanceResponse updateBalance(UpdateBalanceRequest request) {
        try {
            // Find wallet by profile ID
            Optional<Wallet> walletOpt = walletRepository.findByUserProfileId(request.getProfileId());

            if (walletOpt.isEmpty()) {
                return new UpdateBalanceResponse(null,null,null,null,request.getOperation(),
                        request.getTransactionId(), false , "Wallet not found");
            }

            Wallet wallet = walletOpt.get();
            BigDecimal previousBalance = wallet.getBalance();

            // Perform operation
            if ("DEBIT".equalsIgnoreCase(request.getOperation())) {
                // DEBIT: Subtract from balance (send money)
                if (previousBalance.compareTo(request.getAmount()) < 0) {
                    // Not enough balance
                    return new UpdateBalanceResponse(
                            wallet.getId(), previousBalance, previousBalance, request.getAmount(), "DEBIT",
                            request.getTransactionId(), false, "Insufficient balance");
                }
                wallet.setBalance(previousBalance.subtract(request.getAmount()));
            }
            else if ("CREDIT".equalsIgnoreCase(request.getOperation())) {
                // CREDIT: Add to balance (receive money)
                wallet.setBalance(previousBalance.add(request.getAmount()));
            }
            else {
                return new UpdateBalanceResponse(
                        wallet.getId(), previousBalance , previousBalance,
                        request.getAmount(), request.getOperation(),
                        request.getTransactionId(), false, "Invalid operation"
                );
            }

            // Save updated wallet
            Wallet updatedWallet = walletRepository.save(wallet);

            return new UpdateBalanceResponse(updatedWallet.getId(), previousBalance, updatedWallet.getBalance(),
                    request.getAmount(),request.getOperation(), request.getTransactionId(), true, "Balance updated successfully");
        }
        catch (Exception e) {
            return new UpdateBalanceResponse(null, null, null, null, request.getOperation(),
                    request.getTransactionId(), false, "Error: " + e.getMessage());
        }
    }
}
