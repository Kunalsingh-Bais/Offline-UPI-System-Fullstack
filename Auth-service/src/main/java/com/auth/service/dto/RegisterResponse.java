package com.auth.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class RegisterResponse {
    private Integer userId;
    private String email;
    private String message;
    private boolean success;
}

