package com.codecollab.server.config;

import com.codecollab.server.handler.ChatWebSocketHandler;
import com.codecollab.server.handler.CollabWebSocketHandler;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    @Autowired
    private CollabWebSocketHandler collabWebSocketHandler;

    @Autowired
    private ChatWebSocketHandler chatWebSocketHandler;

    @Autowired
    private com.codecollab.server.handler.SignalingWebSocketHandler signalingWebSocketHandler;

    @Autowired
    private JwtHandshakeInterceptor jwtHandshakeInterceptor;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(collabWebSocketHandler, "/ws/collab/**")
                .addInterceptors(jwtHandshakeInterceptor)
                .setAllowedOrigins("*");
        registry.addHandler(chatWebSocketHandler, "/ws/chat")
                .addInterceptors(jwtHandshakeInterceptor)
                .setAllowedOrigins("*");
        registry.addHandler(signalingWebSocketHandler, "/ws/signal/**")
                .addInterceptors(jwtHandshakeInterceptor)
                .setAllowedOrigins("*");
    }
}
