package com.user.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class CreateProfileRequest {
    private Integer authUserId;          // user ID from auth-service
    private String name;
    private String email;
    private String upiId;
    private String phone;
}
