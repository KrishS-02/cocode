package com.codecollab.server.dto;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class JwtResponse {
  private String token;
  private String type = "Bearer";
  private UUID id;
  private String username;
  private String email;

  public JwtResponse(String accessToken, UUID id, String username, String email) {
    this.token = accessToken;
    this.id = id;
    this.username = username;
    this.email = email;
  }
}
