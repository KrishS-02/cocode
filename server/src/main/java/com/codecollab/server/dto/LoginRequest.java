package com.codecollab.server.dto;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;

public class LoginRequest {
    @NotBlank
    private String username;
    @NotBlank
    private String password;
    
    // Getters and Setters (Lombok handles this usually, but writing explicitly for clarity or if user lacks lombok plugin)
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
}
