package com.codecollab.server.repository;

import com.codecollab.server.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {
  Optional<User> findByUsername(String username);

  Boolean existsByUsername(String username);

  Boolean existsByEmail(String email);

  List<User> findByUsernameContainingIgnoreCase(String username);

  @org.springframework.data.jpa.repository.Query("SELECT u FROM User u WHERE LOWER(u.username) = LOWER(:username)")
  Optional<User> findByUsernameIgnoreCase(@org.springframework.data.repository.query.Param("username") String username);

  @org.springframework.data.jpa.repository.Query("SELECT u FROM User u WHERE LOWER(u.email) = LOWER(:email)")
  Optional<User> findByEmailIgnoreCase(@org.springframework.data.repository.query.Param("email") String email);
}
