package com.codecollab.server.config;

import com.codecollab.server.security.JwtUtils;
import com.codecollab.server.model.User;
import com.codecollab.server.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.net.URI;
import java.util.Map;
import java.util.Optional;

@Component
public class JwtHandshakeInterceptor implements HandshakeInterceptor {

    @Autowired
    private JwtUtils jwtUtils;

    @Autowired
    private UserRepository userRepository;

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler wsHandler, Map<String, Object> attributes) throws Exception {
        URI uri = request.getURI();
        String query = uri.getQuery();

        if (query == null || !query.contains("token=")) {
            System.out.println("JwtHandshakeInterceptor: No token found. URI: " + uri + ", Query: " + query);
            return false;
        }

        String token = null;
        for (String param : query.split("&")) {
            if (param.startsWith("token=")) {
                token = param.substring(6);
                break;
            }
        }

        if (token != null && jwtUtils.validateJwtToken(token)) {
            String username = jwtUtils.getUserNameFromJwtToken(token);
            Optional<User> user = userRepository.findByUsernameIgnoreCase(username);

            if (user.isPresent()) {
                attributes.put("userId", user.get().getId());
                attributes.put("username", username);
                return true;
            } else {
                System.out.println("JwtHandshakeInterceptor: User not found: " + username);
            }
        } else {
            System.out.println("JwtHandshakeInterceptor: Invalid JWT token");
        }

        return false;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler wsHandler, Exception exception) {
        // No action needed
    }
}
