package com.auth.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class ValidateTokenResponse {
    private boolean valid;
    private Integer userId;
    private String email;
    private String message;
}

