package com.user.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class CreateProfileResponse {
    private Integer profileId;          // User service profile ID
    private Integer authUserId;
    private String name;
    private String email;
    private String upiId;
    private boolean success;
    private String message;
}
