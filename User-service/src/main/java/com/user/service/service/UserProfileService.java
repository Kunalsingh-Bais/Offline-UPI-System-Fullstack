package com.user.service.service;

import com.user.service.Entity.UserProfile;
import com.user.service.Entity.Wallet;
import com.user.service.dto.CreateProfileRequest;
import com.user.service.dto.CreateProfileResponse;
import com.user.service.dto.GetProfileResponse;
import com.user.service.repository.UserProfileRepository;
import com.user.service.repository.WalletRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Optional;

@Service
public class UserProfileService {

    @Autowired
    private UserProfileRepository userProfileRepository;

    @Autowired
    private WalletRepository walletRepository;

    // ------ Create Profile ------
    public CreateProfileResponse createProfile(CreateProfileRequest request) {
        try{
            // Check if UPI ID already exists
            if(userProfileRepository.existsByUpiId(request.getUpiId())) {
                return new CreateProfileResponse(null,request.getAuthUserId(), request.getName(),
                        request.getEmail(), request.getUpiId(), false, "UPI ID already exists");
            }

            // Create new UserProfile
            UserProfile profile  = new UserProfile();
            profile.setAuthUserId(request.getAuthUserId());
            profile.setName(request.getName());
            profile.setEmail(request.getEmail());
            profile.setUpiId(request.getUpiId());
            profile.setPhone(request.getPhone());
            profile.setIsVerified(false);             // by default not verified

            // Save profile to database
            UserProfile savedProfile = userProfileRepository.save(profile);

            // Create wallet for this user
            Wallet wallet = new Wallet();
            wallet.setUserProfile(savedProfile);
            wallet.setBalance(BigDecimal.ZERO);
            walletRepository.save(wallet);

            // Return success response
            return new CreateProfileResponse(savedProfile.getId(), savedProfile.getAuthUserId(),savedProfile.getName(),
                    savedProfile.getEmail(),savedProfile.getUpiId(),true,"Profile created successfully"
            );
        }
        catch (Exception e) {
            return new CreateProfileResponse(null, request.getAuthUserId(), request.getUpiId(),
                    request.getName(), request.getEmail(),false,"Error: " +e.getMessage());
        }
    }

    // ------ Get profile by auth user Id ------
    public GetProfileResponse getProfile(Integer authUserId) {
        Optional<UserProfile> profileOpt = userProfileRepository.findByAuthUserId(authUserId);

        if(profileOpt.isEmpty()) {
            return new GetProfileResponse(null,null,null,null,null,null,false, "Profile not found");
        }

        UserProfile profile = profileOpt.get();
        return new GetProfileResponse(profile.getId(),profile.getAuthUserId(),profile.getName(),
                profile.getEmail(),profile.getUpiId(),profile.getPhone(), true , "Profile found");
    }
}
