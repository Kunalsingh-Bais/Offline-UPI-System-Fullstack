package com.auth.service.exception;

import jakarta.servlet.http.HttpServletRequest;
import org.apache.coyote.Response;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.time.LocalDateTime;

@RestControllerAdvice  // Catches exceptions from all controllers
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    // Handle: User already exists
    @ExceptionHandler(UserAlreadyExistsException.class)
    public ResponseEntity<ApiExceptionDto> handlerUserAlreadyExists(UserAlreadyExistsException ex, HttpServletRequest request) {

        ApiExceptionDto apiException = new ApiExceptionDto(
                "UserAlreadyExistsException",
                HttpStatus.CONFLICT.value(),
                ex.getMessage(),
                LocalDateTime.now(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(apiException,HttpStatus.CONFLICT);
    }

    // Handle: User not found
    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<ApiExceptionDto> handlerUserNotFound(UserNotFoundException ex, HttpServletRequest request) {

        ApiExceptionDto apiException = new ApiExceptionDto(
                "UserNotFoundException",
                HttpStatus.NOT_FOUND.value(),
                ex.getMessage(),
                LocalDateTime.now(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(apiException,HttpStatus.NOT_FOUND);
    }

    // Handle: Invalid credentials (wrong password)
    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<ApiExceptionDto> handleInvalidCredentials(InvalidCredentialsException ex, HttpServletRequest request) {

        ApiExceptionDto apiException = new ApiExceptionDto(
                "InvalidCredentialsException",
                HttpStatus.UNAUTHORIZED.value(),
                ex.getMessage(),
                LocalDateTime.now(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(apiException,HttpStatus.UNAUTHORIZED);
    }

    // Handle: Invalid token
    @ExceptionHandler(InvalidTokenException.class)
    public ResponseEntity<ApiExceptionDto> handleInvalidToken(InvalidTokenException ex, HttpServletRequest request) {

        ApiExceptionDto apiException = new ApiExceptionDto(
                "InvalidTokenException",
                HttpStatus.UNAUTHORIZED.value(),
                ex.getMessage(),
                LocalDateTime.now(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(apiException,HttpStatus.UNAUTHORIZED);
    }

    // Handle: Generic exceptions
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiExceptionDto> handleGenericException(Exception ex, HttpServletRequest request) {

        ApiExceptionDto apiException = new ApiExceptionDto(
                "InternalServerError",
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                "Something went wrong: "+ ex.getMessage(),
                LocalDateTime.now(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(apiException,HttpStatus.INTERNAL_SERVER_ERROR);
    }
}

