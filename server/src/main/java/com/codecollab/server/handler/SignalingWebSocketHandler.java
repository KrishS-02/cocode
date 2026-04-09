package com.codecollab.server.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

@Component
public class SignalingWebSocketHandler extends TextWebSocketHandler {

    private final Map<String, Set<WebSocketSession>> rooms = new ConcurrentHashMap<>();
    private final Map<String, UUID> sessionUserMap = new ConcurrentHashMap<>();
    private final Map<String, String> sessionUsernameMap = new ConcurrentHashMap<>();
    private final Map<String, String> sessionRoomMap = new ConcurrentHashMap<>();
    private final Map<String, Set<String>> voiceUsers = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String roomId = getRoomId(session);
        UUID userId = (UUID) session.getAttributes().get("userId");

        if (userId == null) {
            session.close(CloseStatus.BAD_DATA);
            return;
        }

        rooms.computeIfAbsent(roomId, k -> new CopyOnWriteArraySet<>()).add(session);
        sessionUserMap.put(session.getId(), userId);
        sessionRoomMap.put(session.getId(), roomId);

        sendMessage(session, Map.of(
                "type", "CONNECTED",
                "sessionId", session.getId(),
                "userId", userId.toString()
        ));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String roomId = sessionRoomMap.remove(session.getId());
        UUID userId = sessionUserMap.remove(session.getId());
        sessionUsernameMap.remove(session.getId());

        if (roomId != null) {
            Set<WebSocketSession> room = rooms.get(roomId);
            if (room != null) {
                room.remove(session);

                Set<String> voiceSet = voiceUsers.get(roomId);
                if (voiceSet != null && voiceSet.remove(session.getId())) {
                    broadcastToVoiceUsers(roomId, session.getId(), Map.of(
                            "type", "LEAVE_VOICE",
                            "senderId", session.getId(),
                            "userId", userId != null ? userId.toString() : ""
                    ));
                    if (voiceSet.isEmpty()) voiceUsers.remove(roomId);
                }

                if (userId != null) {
                    broadcastToRoom(roomId, session, Map.of(
                            "type", "USER_LEFT",
                            "userId", userId.toString(),
                            "leaverId", session.getId()
                    ));
                }

                if (room.isEmpty()) rooms.remove(roomId);
            }
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        Map<String, Object> payload;
        try {
            payload = objectMapper.readValue(message.getPayload(), Map.class);
        } catch (Exception e) {
            return;
        }

        String type = (String) payload.get("type");
        String roomId = sessionRoomMap.get(session.getId());
        UUID userId = sessionUserMap.get(session.getId());

        if (roomId == null || userId == null) return;

        switch (type) {
            case "CHAT":
                broadcastToRoom(roomId, session, Map.of(
                        "type", "CHAT",
                        "senderId", userId.toString(),
                        "senderName", payload.getOrDefault("senderName", "Unknown"),
                        "content", payload.getOrDefault("content", ""),
                        "timestamp", java.time.LocalDateTime.now().toString()));
                break;

            case "SIGNAL":
                String targetId = (String) payload.get("targetId");
                WebSocketSession target = findSessionById(roomId, targetId);
                if (target != null && target.isOpen()) {
                    sendMessage(target, Map.of(
                            "type", "SIGNAL",
                            "senderId", session.getId(),
                            "senderName", payload.getOrDefault("senderName", "Unknown"),
                            "data", payload.get("data")));
                }
                break;

            case "JOIN_VOICE":
                Set<String> voiceSet = voiceUsers.computeIfAbsent(roomId, k -> ConcurrentHashMap.newKeySet());
                String senderName = (String) payload.getOrDefault("senderName", "Unknown");
                sessionUsernameMap.put(session.getId(), senderName);

                List<Map<String, String>> existingOnes = new ArrayList<>();
                for (String sid : voiceSet) {
                    existingOnes.add(Map.of(
                            "sessionId", sid,
                            "username", sessionUsernameMap.getOrDefault(sid, "User")
                    ));
                }

                voiceSet.add(session.getId());

                // 1. Tell the newcomer who is already there
                sendMessage(session, Map.of(
                        "type", "VOICE_USERS_LIST",
                        "voiceUsers", existingOnes
                ));

                // 2. Tell existing users a new person joined
                broadcastToVoiceUsers(roomId, session.getId(), Map.of(
                        "type", "JOIN_VOICE",
                        "senderId", session.getId(),
                        "senderName", senderName
                ));
                break;

            case "LEAVE_VOICE":
                Set<String> vs = voiceUsers.get(roomId);
                if (vs != null && vs.remove(session.getId())) {
                    broadcastToVoiceUsers(roomId, session.getId(), Map.of(
                            "type", "LEAVE_VOICE",
                            "senderId", session.getId()
                    ));
                }
                break;
        }
    }

    private void broadcastToRoom(String roomId, WebSocketSession exclude, Map<String, Object> msg) {
        Set<WebSocketSession> room = rooms.get(roomId);
        if (room != null) {
            room.stream()
                .filter(s -> s.isOpen() && (exclude == null || !s.getId().equals(exclude.getId())))
                .forEach(s -> sendMessage(s, msg));
        }
    }

    private void broadcastToVoiceUsers(String roomId, String excludeId, Map<String, Object> msg) {
        Set<String> vSet = voiceUsers.get(roomId);
        Set<WebSocketSession> room = rooms.get(roomId);
        if (vSet != null && room != null) {
            room.stream()
                .filter(s -> s.isOpen() && !s.getId().equals(excludeId) && vSet.contains(s.getId()))
                .forEach(s -> sendMessage(s, msg));
        }
    }

    private void sendMessage(WebSocketSession session, Map<String, Object> message) {
        try {
            synchronized (session) {
                if (session.isOpen()) {
                    session.sendMessage(new TextMessage(objectMapper.writeValueAsString(message)));
                }
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private WebSocketSession findSessionById(String roomId, String sessionId) {
        Set<WebSocketSession> room = rooms.get(roomId);
        if (room == null || sessionId == null) return null;
        return room.stream()
                .filter(s -> s.getId().equals(sessionId))
                .findFirst()
                .orElse(null);
    }

    private String getRoomId(WebSocketSession session) {
        URI uri = session.getUri();
        if (uri == null) return "default";
        String[] parts = uri.getPath().split("/");
        return (parts.length >= 4) ? parts[3] : "default";
    }
}