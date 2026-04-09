package com.codecollab.server.handler;

import com.codecollab.server.model.EnvironmentPermission;
import com.codecollab.server.service.EnvironmentPermissionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.BinaryWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

@Component
public class CollabWebSocketHandler extends BinaryWebSocketHandler {

    @Autowired
    private EnvironmentPermissionService permissionService;

    // Map<EnvironmentId, Set<Session>>
    private final Map<String, Set<WebSocketSession>> rooms = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String roomId = getRoomId(session);
        rooms.computeIfAbsent(roomId, k -> new CopyOnWriteArraySet<>()).add(session);
        System.out.println("Session " + session.getId() + " joined room " + roomId);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String roomId = getRoomId(session);
        Set<WebSocketSession> room = rooms.get(roomId);
        if (room != null) {
            room.remove(session);
            if (room.isEmpty()) {
                rooms.remove(roomId);
            }
        }
        System.out.println("Session " + session.getId() + " left room " + roomId);
    }

    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) throws Exception {
        String roomId = getRoomId(session);

        // Security Check: Ensure user has EDIT rights
        UUID userId = (UUID) session.getAttributes().get("userId");
        if (userId != null) {
            try {
                UUID environmentId = UUID.fromString(roomId);
                // Allow if EDITOR or ADMIN. If VIEWER, drop message.
                // Note: If user is not found or has no permission, hasPermission typically
                // returns false.
                // But strictly speaking, if we follow "Viewer can't edit", we check for
                // EDITOR/ADMIN.
                if (!permissionService.hasPermission(environmentId, userId, EnvironmentPermission.AccessLevel.EDITOR)) {
                    System.out.println("Blocked write attempt from " + userId + " (VIEWER) in " + roomId);
                    return;
                }
            } catch (IllegalArgumentException e) {
                // Invalid UUID, ignore or allow if we support non-UUID rooms (unlikely for
                // Environments)
            }
        } else {
            System.out.println("Unauthenticated user tried to write in " + roomId);
            return;
        }

        System.out.println("Received binary message from " + session.getId() + " in room " + roomId + ". Payload size: "
                + message.getPayloadLength());
        Set<WebSocketSession> room = rooms.get(roomId);

        if (room != null) {
            for (WebSocketSession s : room) {
                // Send to everyone EXCEPT the sender (Echo logic for Yjs usually implies
                // broadcast to others,
                // but sometimes Yjs expects echo back. Typically Yjs websocket provider expects
                // broadcast to others.
                // However, standard Yjs server implementation often broadcasts to all including
                // sender?
                // Actually, y-websocket provider usually handles local updates immediately.
                // Let's broadcast to *others* to avoid double application of updates on the
                // sender.
                if (s.isOpen()) {
                    try {
                        s.sendMessage(message);
                    } catch (IOException e) {
                        e.printStackTrace();
                    }
                }
            }
        }
    }

    private String getRoomId(WebSocketSession session) {
        // Expected URI: /ws/collab/{environmentId}
        URI uri = session.getUri();
        if (uri == null)
            return "default";

        String path = uri.getPath();
        String[] parts = path.split("/");
        // parts[0] = "", parts[1] = "ws", parts[2] = "collab", parts[3] =
        // "environmentId"
        if (parts.length >= 4) {
            return parts[3];
        }
        return "default";
    }
}
