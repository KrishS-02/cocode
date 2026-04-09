package com.codecollab.server.service;

import com.codecollab.server.handler.ChatWebSocketHandler;
import com.codecollab.server.model.Notification;
import com.codecollab.server.repository.NotificationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class NotificationService {

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private ChatWebSocketHandler chatWebSocketHandler;

    @Transactional
    public Notification createAndSend(UUID recipientId, String message, String linkUrl) {
        Notification notification = new Notification(recipientId, message, linkUrl);
        notificationRepository.save(notification);

        // Broadcast in real-time if user is online (no-op if offline)
        try {
            chatWebSocketHandler.sendEvent(recipientId, "NOTIFICATION", Map.of(
                    "id", notification.getId().toString(),
                    "message", message,
                    "linkUrl", linkUrl != null ? linkUrl : ""));
        } catch (Exception e) {
            // WS send failure should not roll back the DB save
            e.printStackTrace();
        }

        return notification;
    }

    public List<Notification> getForUser(UUID userId) {
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    public long getUnreadCount(UUID userId) {
        return notificationRepository.countByUserIdAndReadFalse(userId);
    }

    @Transactional
    public void markRead(UUID notificationId) {
        notificationRepository.findById(notificationId).ifPresent(n -> {
            n.setRead(true);
            notificationRepository.save(n);
        });
    }

    @Transactional
    public void markAllRead(UUID userId) {
        List<Notification> unread = notificationRepository.findByUserIdOrderByCreatedAtDesc(userId);
        unread.forEach(n -> {
            if (!n.isRead()) {
                n.setRead(true);
                notificationRepository.save(n);
            }
        });
    }
}
