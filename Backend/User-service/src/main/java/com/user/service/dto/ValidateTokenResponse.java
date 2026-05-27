package com.user.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class ValidateTokenResponse {
    private boolean valid;
    private String email;
    private Integer userId;
    private String message;
}
