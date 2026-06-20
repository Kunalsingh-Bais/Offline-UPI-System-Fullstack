package com.user.service.controller;

import com.user.service.Entity.UserProfile;
import com.user.service.dto.CreateProfileRequest;
import com.user.service.dto.CreateProfileResponse;
import com.user.service.dto.GetProfileResponse;
import com.user.service.service.UserProfileService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/user")
public class UserProfileController {

    @Autowired
    private UserProfileService userProfileService;

    // ------ POST /user/profile/create ------
    @PostMapping("/profile/create")
    public ResponseEntity<CreateProfileResponse> createProfile(@RequestBody CreateProfileRequest request) {
        try {
            CreateProfileResponse response = userProfileService.createProfile(request);

            if (response.isSuccess()) {   // 201 Created
                return ResponseEntity.status(HttpStatus.CREATED).body(response);
            }
            else {
                // 400 Bad Request (UPI ID exists, etc.)
                return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(response);
            }
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new CreateProfileResponse(null, request.getAuthUserId(), request.getUpiId(),
                            request.getName(), request.getEmail(),false, "Error: "+ e.getMessage()));
        }
    }

    // ------ GET /user/profile/auth/{authUserId} ------
    @GetMapping("profile/auth/{authUserId}")
    public ResponseEntity<GetProfileResponse> getProfile(@PathVariable Integer authUserId) {
        try {
            GetProfileResponse response = userProfileService.getProfile(authUserId);

            if (response.isSuccess()) {   // 200 OK
                return ResponseEntity.ok(response);
            }
            else {
                // 404 Not Found
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(response);
            }
        }
        catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new GetProfileResponse(null, authUserId, null, null, null, null, false, "Error: " +e.getMessage()));
        }
    }

    @GetMapping("/profile/upi/{upiId}")
    public ResponseEntity<?> getProfileByUpiId(@PathVariable String upiId) {

        System.out.println("🔄 Searching profile by UPI ID: " + upiId);

        try {
            // Find profile by UPI ID
            UserProfile profile = userProfileService.getProfileByUpiId(upiId);

            if (profile == null) {
                return ResponseEntity.status(404).body(Map.of(
                        "success", false,
                        "message", "No user found with UPI ID: " + upiId
                ));
            }

            System.out.println("✅ Profile found: " + profile.getName());

            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "profileId", profile.getId(),
                    "name", profile.getName(),
                    "upiId", profile.getUpiId()
            ));

        } catch (Exception e) {
            System.out.println("❌ Error: " + e.getMessage());
            return ResponseEntity.status(404).body(Map.of(
                    "success", false,
                    "message", "No user found with UPI ID: " + upiId
            ));
        }
    }
}
