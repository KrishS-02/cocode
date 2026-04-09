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

    // Map<EnvironmentId, Set<Session>>
    private final Map<String, Set<WebSocketSession>> rooms = new ConcurrentHashMap<>();

    // Map<SessionId, UserId>
    private final Map<String, UUID> sessionUserMap = new ConcurrentHashMap<>();

    // Map<SessionId, Username> — stored when user joins voice so we can include username in VOICE_USERS_LIST
    private final Map<String, String> sessionUsernameMap = new ConcurrentHashMap<>();

    // Map<SessionId, EnvironmentId>
    private final Map<String, String> sessionRoomMap = new ConcurrentHashMap<>();

    // Map<EnvironmentId, Set<SessionId>> — tracks who is actively in voice
    private final Map<String, Set<String>> voiceUsers = new ConcurrentHashMap<>();

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String roomId = getRoomId(session);
        UUID userId = (UUID) session.getAttributes().get("userId");

        if (userId == null) {
            System.err.println("WS Signal: Unauthorized connection attempt.");
            session.close(CloseStatus.BAD_DATA);
            return;
        }

        rooms.computeIfAbsent(roomId, k -> new CopyOnWriteArraySet<>()).add(session);
        sessionUserMap.put(session.getId(), userId);
        sessionRoomMap.put(session.getId(), roomId);

        System.out.println("WS Signal: User " + userId + " joined room " + roomId + " with session " + session.getId());

        // Tell the client their own session ID so they can use it consistently
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
        sessionUsernameMap.remove(session.getId()); // Clean up username mapping

        if (roomId != null) {
            Set<WebSocketSession> room = rooms.get(roomId);
            if (room != null) {
                room.remove(session);

                // If they were in voice, clean them up from voice users and notify others
                Set<String> voiceSet = voiceUsers.get(roomId);
                if (voiceSet != null && voiceSet.remove(session.getId())) {
                    // Broadcast LEAVE_VOICE with sessionId to remaining voice users
                    broadcastToVoiceUsers(roomId, session.getId(), Map.of(
                            "type", "LEAVE_VOICE",
                            "senderId", session.getId(),
                            "userId", userId != null ? userId.toString() : ""
                    ));
                }

                // Notify all room members that user left entirely (for UI updates)
                if (userId != null) {
                    broadcastToRoom(roomId, session, Map.of(
                            "type", "USER_LEFT",
                            "userId", userId.toString(),
                            "leaverId", session.getId()
                    ));
                }

                if (room.isEmpty()) {
                    rooms.remove(roomId);
                }
                if (voiceSet != null && voiceSet.isEmpty()) {
                    voiceUsers.remove(roomId);
                }
            }
        }
        System.out.println("WS Signal: Session " + session.getId() + " closed.");
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        Map<String, Object> payload;
        try {
            payload = objectMapper.readValue(message.getPayload(), Map.class);
        } catch (Exception e) {
            System.err.println("WS Signal: Failed to parse JSON: " + e.getMessage());
            return;
        }

        String type = (String) payload.get("type");
        String roomId = sessionRoomMap.get(session.getId());
        UUID userId = sessionUserMap.get(session.getId());

        if (roomId == null || userId == null) return;

        if ("CHAT".equals(type)) {
            String content = (String) payload.get("content");
            Map<String, Object> chatMsg = Map.of(
                    "type", "CHAT",
                    "senderId", userId.toString(),
                    "senderName", payload.getOrDefault("senderName", "Unknown"),
                    "content", content != null ? content : "",
                    "timestamp", java.time.LocalDateTime.now().toString());
            broadcastToRoom(roomId, session, chatMsg);

        } else if ("SIGNAL".equals(type)) {
            // Forward WebRTC signal to specific target session
            String targetSessionId = (String) payload.get("targetId");
            if (targetSessionId != null) {
                WebSocketSession targetSession = findSessionById(roomId, targetSessionId);
                if (targetSession != null && targetSession.isOpen()) {
                    Map<String, Object> signalMsg = new HashMap<>();
                    signalMsg.put("type", "SIGNAL");
                    signalMsg.put("senderId", session.getId()); // Always use session ID
                    signalMsg.put("senderName", payload.getOrDefault("senderName", "Unknown"));
                    signalMsg.put("data", payload.get("data"));
                    sendMessage(targetSession, signalMsg);
                }
            }

        } else if ("JOIN_VOICE".equals(type)) {
            // Add this session to the voice set for this room
            Set<String> voiceSet = voiceUsers.computeIfAbsent(roomId, k -> ConcurrentHashMap.newKeySet());

            // Store the sender's username so it can be included in VOICE_USERS_LIST
            String senderName = (String) payload.getOrDefault("senderName", "Unknown");
            sessionUsernameMap.put(session.getId(), senderName);

            // Collect existing voice participants BEFORE adding self
            List<Map<String, String>> existingVoiceUsers = new ArrayList<>();
            for (String existingSessionId : voiceSet) {
                UUID existingUserId = sessionUserMap.get(existingSessionId);
                String existingUsername = sessionUsernameMap.getOrDefault(existingSessionId, "User");
                if (existingUserId != null) {
                    existingVoiceUsers.add(Map.of(
                            "sessionId", existingSessionId,
                            "userId", existingUserId.toString(),
                            "username", existingUsername
                    ));
                }
            }

            voiceSet.add(session.getId());

            // Send back the list of existing voice users to the joiner
            // They will initiate P2P connections to each of these
            Map<String, Object> listMsg = new HashMap<>();
            listMsg.put("type", "VOICE_USERS_LIST");
            listMsg.put("voiceUsers", existingVoiceUsers);
            sendMessage(session, listMsg);

            // Broadcast JOIN_VOICE to existing voice users so they answer our offer
            Map<String, Object> joinMsg = Map.of(
                    "type", "JOIN_VOICE",
                    "senderId", session.getId(),   // Always use session ID
                    "userId", userId.toString(),
                    "senderName", senderName
            );
            broadcastToVoiceUsers(roomId, session.getId(), joinMsg);

        } else if ("LEAVE_VOICE".equals(type)) {
            Set<String> voiceSet = voiceUsers.get(roomId);
            if (voiceSet != null) {
                voiceSet.remove(session.getId());
                if (voiceSet.isEmpty()) voiceUsers.remove(roomId);
            }

            // Notify all voice users that this person left voice
            Map<String, Object> leaveMsg = Map.of(
                    "type", "LEAVE_VOICE",
                    "senderId", session.getId(),
                    "userId", userId.toString()
            );
            broadcastToVoiceUsers(roomId, session.getId(), leaveMsg);
        }
    }

    private void broadcastToRoom(String roomId, WebSocketSession excludeSession, Map<String, Object> message) {
        Set<WebSocketSession> room = rooms.get(roomId);
        if (room != null) {
            String json;
            try {
                json = objectMapper.writeValueAsString(message);
            } catch (IOException e) {
                e.printStackTrace();
                return;
            }

            for (WebSocketSession s : room) {
                if (s.isOpen()) {
                    if (excludeSession == null || !s.getId().equals(excludeSession.getId())) {
                        try {
                            synchronized (s) {
                                s.sendMessage(new TextMessage(json));
                            }
                        } catch (IOException e) {
                            e.printStackTrace();
                        }
                    }
                }
            }
        }
    }

    // Broadcast only to sessions that are actively in voice
    private void broadcastToVoiceUsers(String roomId, String excludeSessionId, Map<String, Object> message) {
        Set<String> voiceSet = voiceUsers.get(roomId);
        if (voiceSet == null) return;

        Set<WebSocketSession> room = rooms.get(roomId);
        if (room == null) return;

        String json;
        try {
            json = objectMapper.writeValueAsString(message);
        } catch (IOException e) {
            e.printStackTrace();
            return;
        }

        for (WebSocketSession s : room) {
            if (s.isOpen() && !s.getId().equals(excludeSessionId) && voiceSet.contains(s.getId())) {
                try {
                    synchronized (s) {
                        s.sendMessage(new TextMessage(json));
                    }
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }
        }
    }

    private void sendMessage(WebSocketSession session, Map<String, Object> message) {
        try {
            synchronized (session) {
                session.sendMessage(new TextMessage(objectMapper.writeValueAsString(message)));
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private WebSocketSession findSessionById(String roomId, String sessionId) {
        Set<WebSocketSession> room = rooms.get(roomId);
        if (room != null) {
            for (WebSocketSession s : room) {
                if (s.getId().equals(sessionId)) {
                    return s;
                }
            }
        }
        return null;
    }

    private String getRoomId(WebSocketSession session) {
        URI uri = session.getUri();
        if (uri == null) return "default";

        String path = uri.getPath();
        String[] parts = path.split("/");
        // parts[0]="", parts[1]="ws", parts[2]="signal", parts[3]="envId"
        if (parts.length >= 4) {
            return parts[3];
        }
        return "default";
    }
}
