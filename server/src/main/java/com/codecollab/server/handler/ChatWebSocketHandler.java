package com.codecollab.server.handler;

import com.codecollab.server.model.ChatMessage;
import com.codecollab.server.model.User;
import com.codecollab.server.repository.ChatMessageRepository;
import com.codecollab.server.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class ChatWebSocketHandler extends TextWebSocketHandler {

    // Store multiple sessions per user
    private final Map<UUID, Set<WebSocketSession>> userSessions = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    private ChatMessageRepository chatMessageRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private com.codecollab.server.repository.GroupMemberRepository groupMemberRepository;

    @Autowired
    private com.codecollab.server.repository.GroupRepository groupRepository;

    @Autowired
    private com.codecollab.server.repository.FriendRequestRepository friendRequestRepository;

    @Autowired
    @org.springframework.context.annotation.Lazy
    private com.codecollab.server.service.NotificationService notificationService;

    @Autowired
    private com.codecollab.server.service.EnvironmentPermissionService permissionService;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        // Use the userId extracted by JwtHandshakeInterceptor
        UUID userId = (UUID) session.getAttributes().get("userId");

        if (userId != null) {
            boolean wasOnline = isUserOnline(userId);
            userSessions.computeIfAbsent(userId, k -> ConcurrentHashMap.newKeySet()).add(session);
            System.out.println("WS: User " + userId + " connected. Sessions: " + userSessions.get(userId).size());

            if (!wasOnline) {
                System.out.println("WS: User " + userId + " is now ONLINE. Broadcasting.");
                broadcastUserStatus(userId, true);
            }
        } else {
            System.err.println("WS: Unauthorized connection attempt (no userId in attributes)");
            session.close(CloseStatus.BAD_DATA);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        // Find which user this session belongs to
        UUID userId = null;
        for (Map.Entry<UUID, Set<WebSocketSession>> entry : userSessions.entrySet()) {
            if (entry.getValue().contains(session)) {
                userId = entry.getKey();
                break;
            }
        }

        if (userId != null) {
            Set<WebSocketSession> sessions = userSessions.get(userId);
            if (sessions != null) {
                boolean removed = sessions.remove(session);
                System.out.println("WS: Session closed for user " + userId + ". Removed? " + removed
                        + ". Remaining sessions: " + sessions.size());
                if (sessions.isEmpty()) {
                    userSessions.remove(userId);
                    System.out.println("WS: User " + userId + " has no more sessions. Broadcasting OFFLINE.");
                    broadcastUserStatus(userId, false);
                }
            }
        } else {
            System.out.println("WS: Closed session not found in any user mapping.");
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        System.out.println("WS: Received message payload: " + message.getPayload());

        Map<String, Object> payload;
        try {
            payload = objectMapper.readValue(message.getPayload(), Map.class);
        } catch (Exception e) {
            System.err.println("WS: Failed to parse JSON payload: " + e.getMessage());
            return;
        }

        String type = (String) payload.get("type");
        if ("LOGOUT".equals(type)) {
            handleLogoutMessage(session);
            return;
        }

        if ("EXAM_VIOLATION".equals(type)) {
            handleExamViolation(session, payload);
            return;
        }

        // Safely get values
        String receiverIdStr = payload.get("receiverId") != null ? payload.get("receiverId").toString() : null;
        String groupIdStr = payload.get("groupId") != null ? payload.get("groupId").toString() : null;
        String content = payload.get("content") != null ? payload.get("content").toString() : null;

        // Identify sender from session
        UUID senderId = null;
        for (Map.Entry<UUID, Set<WebSocketSession>> entry : userSessions.entrySet()) {
            if (entry.getValue().contains(session)) {
                senderId = entry.getKey();
                break;
            }
        }

        if (senderId == null) {
            System.err.println("WS: Unidentified sender session. Ignoring message.");
            return;
        }
        if (content == null || content.trim().isEmpty()) {
            System.err.println("WS: Content is null or empty. Ignoring.");
            return;
        }

        User sender = userRepository.findById(senderId).orElse(null);
        if (sender == null) {
            System.err.println("WS: Sender user not found in DB: " + senderId);
            return;
        }

        if (groupIdStr != null) {
            System.out.println("WS: Processing GROUP message for group: " + groupIdStr);
            try {
                UUID groupId = UUID.fromString(groupIdStr);
                com.codecollab.server.model.Group group = groupRepository.findById(groupId).orElse(null);

                if (group != null) {
                    // Verify sender is member
                    if (groupMemberRepository.findByGroupAndUser(group, sender).isPresent()) {
                        System.out.println("WS: Sender is member. Saving message.");

                        ChatMessage chatMessage = new ChatMessage();
                        chatMessage.setSender(sender);
                        chatMessage.setGroupId(groupId);
                        chatMessage.setContent(content);

                        try {
                            chatMessageRepository.save(chatMessage);
                            System.out.println("WS: Message saved. ID: " + chatMessage.getId());
                        } catch (Exception e) {
                            try {
                                synchronized (session) {
                                    session.sendMessage(new TextMessage(objectMapper.writeValueAsString(Map.of(
                                            "type", "ERROR",
                                            "message", "Failed to save message: " + e.getMessage()))));
                                }
                            } catch (Exception wsError) {
                                // ignore
                            }
                            e.printStackTrace();
                            return;
                        }

                        // Broadcast
                        Map<String, Object> response = Map.of(
                                "type", "GROUP_CHAT",
                                "id",
                                chatMessage.getId() != null ? chatMessage.getId().toString()
                                        : UUID.randomUUID().toString(),
                                "senderId", sender.getId().toString(),
                                "senderName", sender.getUsername(),
                                "groupId", groupId.toString(),
                                "content", content,
                                "timestamp", chatMessage.getTimestamp() != null ? chatMessage.getTimestamp().toString()
                                        : java.time.LocalDateTime.now().toString());
                        String jsonResponse = objectMapper.writeValueAsString(response);

                        // Get all members
                        java.util.List<com.codecollab.server.model.GroupMember> members = groupMemberRepository
                                .findByGroup(group);
                        System.out.println("WS: Broadcasting to " + members.size() + " members");
                        for (com.codecollab.server.model.GroupMember member : members) {
                            sendToUser(member.getUser().getId(), jsonResponse);
                        }
                    } else {
                        System.err.println("WS: Sender " + senderId + " is NOT a member of group " + groupId);
                        sendErrorMessage(session, "You are not a member of this group");
                    }
                } else {
                    System.err.println("WS: Group not found: " + groupId);
                    sendErrorMessage(session, "Group not found");
                }
            } catch (IllegalArgumentException e) {
                System.err.println("WS: Invalid Group UUID: " + groupIdStr);
                sendErrorMessage(session, "Invalid group ID");
            }
        } else if (receiverIdStr != null) {
            // 1:1 Chat
            try {
                UUID receiverId = UUID.fromString(receiverIdStr);
                User receiver = userRepository.findById(receiverId).orElse(null);

                if (receiver != null) {
                    ChatMessage chatMessage = new ChatMessage(sender, receiver, content);
                    chatMessageRepository.save(chatMessage);

                    Map<String, Object> response = Map.of(
                            "type", "CHAT",
                            "id",
                            chatMessage.getId() != null ? chatMessage.getId().toString() : UUID.randomUUID().toString(),
                            "senderId", sender.getId().toString(),
                            "senderName", sender.getUsername(),
                            "content", content,
                            "timestamp", chatMessage.getTimestamp() != null ? chatMessage.getTimestamp().toString()
                                    : java.time.LocalDateTime.now().toString());

                    String jsonResponse = objectMapper.writeValueAsString(response);
                    sendToUser(receiverId, jsonResponse);
                    // Also send back to sender so they see their own message if not optimistic
                    if (!senderId.equals(receiverId)) {
                        sendToUser(senderId, jsonResponse);
                    }
                } else {
                    System.err.println("WS: Receiver not found: " + receiverId);
                }
            } catch (IllegalArgumentException e) {
                System.err.println("WS: Invalid Receiver UUID: " + receiverIdStr);
            }
        } else {
            System.err.println("WS: Message missing both groupId and receiverId");
        }
    }

    private void handleLogoutMessage(WebSocketSession session) {
        // Find which user this session belongs to
        UUID userId = null;
        for (Map.Entry<UUID, Set<WebSocketSession>> entry : userSessions.entrySet()) {
            if (entry.getValue().contains(session)) {
                userId = entry.getKey();
                break;
            }
        }

        if (userId != null) {
            System.out.println("WS: Received LOGOUT command from user " + userId + ". Force clearing sessions.");
            Set<WebSocketSession> sessions = userSessions.remove(userId);
            if (sessions != null) {
                for (WebSocketSession s : sessions) {
                    try {
                        s.close(CloseStatus.NORMAL);
                    } catch (IOException e) {
                        // Ignore
                    }
                }
            }
            broadcastUserStatus(userId, false);
        } else {
            System.out.println("WS: LOGOUT command from unknown session.");
        }
    }

    private void handleExamViolation(WebSocketSession session, Map<String, Object> payload) {
        String envIdStr = payload.get("environmentId") != null ? payload.get("environmentId").toString() : null;
        String violationType = payload.get("violationType") != null ? payload.get("violationType").toString() : "suspicious activity";

        UUID senderId = null;
        for (Map.Entry<UUID, Set<WebSocketSession>> entry : userSessions.entrySet()) {
            if (entry.getValue().contains(session)) {
                senderId = entry.getKey();
                break;
            }
        }

        if (senderId == null || envIdStr == null) return;

        User sender = userRepository.findById(senderId).orElse(null);
        if (sender == null) return;

        try {
            UUID envId = UUID.fromString(envIdStr);
            java.util.List<com.codecollab.server.model.EnvironmentPermission> perms = permissionService.getPermissions(envId);

            String alertMessage = "⚠️ " + sender.getUsername() + " " + violationType + " during the exam!";

            for (com.codecollab.server.model.EnvironmentPermission p : perms) {
                if (p.getAccessLevel() == com.codecollab.server.model.EnvironmentPermission.AccessLevel.ADMIN) {
                    // 1. Persistent notification (bell/history)
                    notificationService.createAndSend(p.getUser().getId(), alertMessage, "/editor/" + envId);

                    // 2. Real-time EXAM_ALERT event so admin sees an immediate toast on screen
                    sendEvent(p.getUser().getId(), "EXAM_ALERT", java.util.Map.of(
                            "message", alertMessage,
                            "examinee", sender.getUsername(),
                            "violationType", violationType,
                            "environmentId", envId.toString()
                    ));
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public void sendEvent(UUID userId, String eventType, Object data) {
        try {
            Map<String, Object> payload = Map.of(
                    "type", eventType,
                    "data", data);
            String json = objectMapper.writeValueAsString(payload);
            sendToUser(userId, json);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    public boolean isUserOnline(UUID userId) {
        boolean online = userSessions.containsKey(userId) && !userSessions.get(userId).isEmpty();
        return online;
    }

    private void broadcastUserStatus(UUID userId, boolean isOnline) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null)
            return;

        // Find all friends
        // Friends are users where:
        // 1. Sender = userId, Status = ACCEPTED -> Friend is Receiver
        // 2. Receiver = userId, Status = ACCEPTED -> Friend is Sender

        java.util.List<com.codecollab.server.model.FriendRequest> sent = friendRequestRepository
                .findBySenderAndStatus(user, com.codecollab.server.model.FriendRequestStatus.ACCEPTED);

        java.util.List<com.codecollab.server.model.FriendRequest> received = friendRequestRepository
                .findByReceiverAndStatus(user, com.codecollab.server.model.FriendRequestStatus.ACCEPTED);

        java.util.Set<UUID> friendIds = new java.util.HashSet<>();
        sent.forEach(req -> friendIds.add(req.getReceiver().getId()));
        received.forEach(req -> friendIds.add(req.getSender().getId()));

        System.out.println("WS: Broadcasting " + (isOnline ? "ONLINE" : "OFFLINE") + " status for " + userId + " to "
                + friendIds.size() + " friends.");

        Map<String, Object> statusUpdate = Map.of(
                "type", isOnline ? "USER_ONLINE" : "USER_OFFLINE",
                "userId", userId);

        String jsonMessage;
        try {
            jsonMessage = objectMapper.writeValueAsString(statusUpdate);
        } catch (IOException e) {
            e.printStackTrace();
            return;
        }

        for (UUID friendId : friendIds) {
            System.out.println("WS: Sending status update to friend: " + friendId);
            sendToUser(friendId, jsonMessage);
        }
    }

    private void sendToUser(UUID userId, String message) {
        Set<WebSocketSession> sessions = userSessions.get(userId);
        if (sessions != null && !sessions.isEmpty()) {
            for (WebSocketSession s : sessions) {
                if (s.isOpen()) {
                    try {
                        synchronized (s) {
                            s.sendMessage(new TextMessage(message));
                        }
                    } catch (IOException e) {
                        e.printStackTrace();
                    }
                }
            }
        }
    }

    private void sendErrorMessage(WebSocketSession session, String message) {
        try {
            Map<String, Object> payload = Map.of(
                    "type", "ERROR",
                    "message", message);
            synchronized (session) {
                session.sendMessage(new TextMessage(objectMapper.writeValueAsString(payload)));
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}
