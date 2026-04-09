package com.codecollab.server.security;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

import com.codecollab.server.model.User;
import com.codecollab.server.repository.UserRepository;

@Service
public class UserDetailsServiceImpl implements UserDetailsService {
    @Autowired
    UserRepository userRepository;

    @Override
    @Transactional
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        // Try standard finders first
        Optional<User> userOpt = userRepository.findByUsername(username)
                .or(() -> userRepository.findByUsernameIgnoreCase(username))
                .or(() -> userRepository.findByEmailIgnoreCase(username));

        // Fallback: If query fails but user exists (weird DB/JPA issue), iterate and
        // find.
        User user = userOpt.orElseGet(() -> {
            return userRepository.findAll().stream()
                    .filter(u -> u.getUsername().trim().equalsIgnoreCase(username.trim()) ||
                            u.getEmail().trim().equalsIgnoreCase(username.trim()))
                    .findFirst()
                    .orElseThrow(() -> new UsernameNotFoundException(
                            "User Not Found with username: " + username));
        });

        return UserDetailsImpl.build(user);
    }
}
