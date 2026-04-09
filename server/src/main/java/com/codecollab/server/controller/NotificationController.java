package com.codecollab.server.controller;

import com.codecollab.server.model.Notification;
import com.codecollab.server.security.UserDetailsImpl;
import com.codecollab.server.service.NotificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    @Autowired
    private NotificationService notificationService;

    @GetMapping
    public ResponseEntity<List<Notification>> getNotifications(
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        return ResponseEntity.ok(notificationService.getForUser(userDetails.getId()));
    }

    @GetMapping("/unread-count")
    public ResponseEntity<Map<String, Long>> getUnreadCount(
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        long count = notificationService.getUnreadCount(userDetails.getId());
        return ResponseEntity.ok(Map.of("count", count));
    }

    @PutMapping("/{id}/read")
    public ResponseEntity<?> markRead(@PathVariable UUID id,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        notificationService.markRead(id);
        return ResponseEntity.ok("Marked as read");
    }

    @PutMapping("/read-all")
    public ResponseEntity<?> markAllRead(@AuthenticationPrincipal UserDetailsImpl userDetails) {
        notificationService.markAllRead(userDetails.getId());
        return ResponseEntity.ok("All marked as read");
    }
}
