package com.codecollab.server.controller;

import com.codecollab.server.handler.ChatWebSocketHandler;
import com.codecollab.server.model.FriendRequest;
import com.codecollab.server.model.FriendRequestStatus;
import com.codecollab.server.model.User;
import com.codecollab.server.repository.FriendRequestRepository;
import com.codecollab.server.repository.UserRepository;
import com.codecollab.server.security.UserDetailsImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import com.codecollab.server.repository.NotificationRepository;
import com.codecollab.server.model.Notification;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api")
public class FriendController {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private FriendRequestRepository friendRequestRepository;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private ChatWebSocketHandler chatWebSocketHandler;

    @GetMapping("/users/search")
    public ResponseEntity<List<User>> searchUsers(@RequestParam String query) {
        List<User> users = userRepository.findByUsernameContainingIgnoreCase(query);
        return ResponseEntity.ok(users);
    }

    @PostMapping("/friends/request/{userId}")
    public ResponseEntity<?> sendFriendRequest(@PathVariable UUID userId,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        if (userDetails == null) {
            return ResponseEntity.status(401).body("Unauthorized");
        }
        User sender = userRepository.findById(userDetails.getId())
                .orElseThrow(() -> new RuntimeException("Sender not found"));
        User receiver = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("Receiver not found"));

        if (sender.getId().equals(receiver.getId())) {
            return ResponseEntity.badRequest().body("Cannot send friend request to yourself");
        }

        if (friendRequestRepository.findBySenderAndReceiver(sender, receiver).isPresent()) {
            return ResponseEntity.badRequest().body("Friend request already sent");
        }

        FriendRequest request = new FriendRequest(sender, receiver, FriendRequestStatus.PENDING);
        friendRequestRepository.save(request);

        // Notify receiver via WebSocket
        chatWebSocketHandler.sendEvent(receiver.getId(), "FRIEND_REQUEST", Map.of(
                "requestId", request.getId(),
                "senderId", sender.getId(),
                "senderName", sender.getUsername()));

        // Save persistent notification in DB
        Notification notification = new Notification(receiver.getId(), sender.getUsername() + " sent you a friend request", "#friends");
        notificationRepository.save(notification);

        return ResponseEntity.ok("Friend request sent");
    }

    @PutMapping("/friends/accept/{requestId}")
    public ResponseEntity<?> acceptFriendRequest(@PathVariable UUID requestId,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        if (userDetails == null) {
            return ResponseEntity.status(401).body("Unauthorized");
        }
        FriendRequest request = friendRequestRepository.findById(requestId)
                .orElseThrow(() -> new RuntimeException("Request not found"));

        if (!request.getReceiver().getId().equals(userDetails.getId())) {
            return ResponseEntity.status(403).body("Not your friend request");
        }

        request.setStatus(FriendRequestStatus.ACCEPTED);
        friendRequestRepository.save(request);

        // Notify sender that request was accepted (Optional, but good UX)
        chatWebSocketHandler.sendEvent(request.getSender().getId(), "FRIEND_REQUEST_ACCEPTED", Map.of(
                "accepterId", userDetails.getId(),
                "accepterName", userDetails.getUsername()));

        return ResponseEntity.ok("Friend request accepted");
    }

    @GetMapping("/friends/requests")
    public ResponseEntity<List<FriendRequest>> getFriendRequests(@AuthenticationPrincipal UserDetailsImpl userDetails) {
        if (userDetails == null) {
            return ResponseEntity.status(401).build();
        }
        User user = userRepository.findById(userDetails.getId()).orElseThrow();
        return ResponseEntity.ok(friendRequestRepository.findByReceiverAndStatus(user, FriendRequestStatus.PENDING));
    }

    @GetMapping("/friends")
    public ResponseEntity<List<User>> getFriends(@AuthenticationPrincipal UserDetailsImpl userDetails) {
        if (userDetails == null) {
            return ResponseEntity.status(401).build();
        }
        User user = userRepository.findById(userDetails.getId()).orElseThrow();

        // Find requests where I am sender AND status is ACCEPTED
        List<FriendRequest> sentAccepted = friendRequestRepository.findBySenderAndStatus(user,
                FriendRequestStatus.ACCEPTED);

        // Find requests where I am receiver AND status is ACCEPTED
        List<FriendRequest> receivedAccepted = friendRequestRepository.findByReceiverAndStatus(user,
                FriendRequestStatus.ACCEPTED);

        List<User> friends = sentAccepted.stream().map(FriendRequest::getReceiver).collect(Collectors.toList());
        friends.addAll(receivedAccepted.stream().map(FriendRequest::getSender).collect(Collectors.toList()));

        friends.forEach(friend -> {
            boolean isOnline = chatWebSocketHandler.isUserOnline(friend.getId());
            friend.setOnline(isOnline);
            System.out.println(
                    "DEBUG: User " + friend.getUsername() + " (" + friend.getId() + ") is online? " + isOnline);
        });

        return ResponseEntity.ok(friends);
    }
}
