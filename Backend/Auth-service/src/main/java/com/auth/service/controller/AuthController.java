package com.auth.service.controller;

import com.auth.service.dto.*;
import com.auth.service.service.AuthService;
import org.apache.hc.core5.http.HttpStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/auth")
public class AuthController {

    @Autowired
    private AuthService authService;

    @PostMapping("/register")
    public ResponseEntity<RegisterResponse> register(@RequestBody RegisterRequest request){
        // Call service to register

        System.out.println("====== Register Endpoint hit ======");
        System.out.println("Email: "+ request.getEmail());
        try{
            RegisterResponse response = authService.register(request);

            System.out.println("==== Register success ==== ");
            if(response.isSuccess()) {
                return ResponseEntity.status(HttpStatus.SC_CREATED).body(response);
            }
            else {
                return ResponseEntity.status(HttpStatus.SC_BAD_REQUEST).body(response);
            }
        }
        catch (Exception e) {

            System.out.println("===== Register exception =====");
            return ResponseEntity.status(HttpStatus.SC_INTERNAL_SERVER_ERROR)
                    .body(new RegisterResponse(null, request.getEmail(), "Error: "+e.getMessage(),false));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest request) {
        try{
            LoginResponse response = authService.login(request);

            if(response.isSuccess()){
                return ResponseEntity.ok(response);
            }
            else {
                return ResponseEntity.status(HttpStatus.SC_UNAUTHORIZED).body(response);
            }
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.SC_INTERNAL_SERVER_ERROR)
                    .body(new LoginResponse(null,null, request.getEmail(), "Error: "+e.getMessage(),false));
        }
    }

    @PostMapping("/validate-token")
    public ResponseEntity<ValidateTokenResponse> validateToken(@RequestBody ValidateTokenRequest request) {
        try{
            ValidateTokenResponse response = authService.validateToken(request.getToken());

            if(response.isValid()) {
                return ResponseEntity.ok(response);
            }
            else {
                return ResponseEntity.status(HttpStatus.SC_UNAUTHORIZED).body(response);
            }
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.SC_INTERNAL_SERVER_ERROR)
                    .body(new ValidateTokenResponse(false,null,null,"Error: "+e.getMessage()));
        }

    }

}

