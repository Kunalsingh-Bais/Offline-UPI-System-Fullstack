package com.user.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class GetProfileResponse {
    private Integer profileId;
    private Integer authUserId;
    private String name;
    private String email;
    private String upiId;
    private String phone;
    private boolean success;
    private String message;
}
