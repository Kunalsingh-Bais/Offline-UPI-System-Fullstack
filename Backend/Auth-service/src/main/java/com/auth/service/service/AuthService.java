package com.auth.service.service;

import com.auth.service.dto.*;
import com.auth.service.entity.User;
import com.auth.service.repository.UserRepository;
import com.auth.service.security.JwtTokenProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class AuthService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    // ------- REGISTER -------
    public RegisterResponse register(RegisterRequest request) {
        // Step 1: Check if email already exists
        if(userRepository.existsByEmail(request.getEmail())) {
            return new RegisterResponse(null, request.getEmail(), "User with email already exists",false);
        }

        // Step 2: Create new User object
        User user  = new User();
        user.setEmail(request.getEmail());
        user.setName(request.getName());
        user.setUpiId(request.getUpiId());
        user.setPhone(request.getPhone());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setIsActive(true);

        // Step 3: Save to database
        User savedUser = userRepository.save(user);

        // Step 4: Return success response
        return new RegisterResponse(savedUser.getId(), savedUser.getEmail(),
                "User registered successfully", true);
    }

    // ------ LOGIN -------
    public LoginResponse login(LoginRequest request) {
        // Step 1: Find user by email
        Optional<User> userOpt = userRepository.findByEmail(request.getEmail());

        if(userOpt.isEmpty()) {
            return new LoginResponse(null,null, request.getName(), request.getEmail(),"User not found",false);
        }

        User user = userOpt.get();

        // Step 2: Check password matches
        if(!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            return new LoginResponse(null,null, request.getName(), request.getEmail(),"Invalid Password",false);
        }

        // Step 3: Check user is active
        if(!user.getIsActive()) {
            return new LoginResponse(null,null, request.getName(), request.getEmail(),"User account is inactive",false);
        }

        // Step 4: Generate JWT token
        String token = jwtTokenProvider.generateToken(user.getEmail(), user.getId());

        // Step 5: Return token
        return new LoginResponse(token, user.getId(), user.getName(), user.getEmail(), "Login successful",true);
    }

    // ------- VALIDATE TOKEN -------
    public ValidateTokenResponse validateToken(String token) {
        // Step 1: Check if token is valid
        if(!jwtTokenProvider.validateToken(token)) {
            return new ValidateTokenResponse(false,null,null,"Invalid or expired token");
        }

        // Step 2: Extract email and userId from token
        String email = jwtTokenProvider.getEmailFromToken(token);
        Integer userId = jwtTokenProvider.getUserIdFromToken(token);

        // Step 3: Return valid response
        return new ValidateTokenResponse(true ,userId, email,"Token is valid");
    }
}

