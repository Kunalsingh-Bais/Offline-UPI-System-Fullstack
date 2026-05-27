package com.user.service.repository;

import com.user.service.Entity.UserProfile;
import com.user.service.Entity.Wallet;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface WalletRepository extends JpaRepository<Wallet,Integer> {

    // Find wallet by user profile
    Optional<Wallet> findByUserProfile(UserProfile userProfile);

    // Find wallet by user profile ID
    Optional<Wallet> findByUserProfileId(Integer userProfileId);
}
