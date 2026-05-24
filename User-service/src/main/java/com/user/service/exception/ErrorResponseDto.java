package com.user.service.exception;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class ErrorResponseDto {
    private String error;
    private int status;
    private String message;
    private LocalDateTime timestamp;
    private String path;
}
