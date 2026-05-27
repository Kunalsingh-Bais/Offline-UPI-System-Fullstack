package com.user.service.repository;

import com.user.service.Entity.UserProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserProfileRepository extends JpaRepository<UserProfile, Integer> {

    // Find profile by auth user ID (from auth-service)
    Optional<UserProfile> findByAuthUserId(Integer authUserId);

    // Find profile by UPI ID
    Optional<UserProfile> findByUpiId(String upiId);

    // Find profile By email
    Optional<UserProfile> findByEmail(String email);

    // Check if UPI ID exists
    boolean existsByUpiId(String upiId);
}
