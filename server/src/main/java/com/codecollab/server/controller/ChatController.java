package com.codecollab.server.controller;

import com.codecollab.server.model.ChatMessage;
import com.codecollab.server.model.User;
import com.codecollab.server.repository.ChatMessageRepository;
import com.codecollab.server.repository.UserRepository;
import com.codecollab.server.security.UserDetailsImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/chat")
public class ChatController {

    @Autowired
    private ChatMessageRepository chatMessageRepository;

    @Autowired
    private UserRepository userRepository;

    @GetMapping("/{friendId}")
    public ResponseEntity<List<ChatMessage>> getChatHistory(@PathVariable UUID friendId,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        if (userDetails == null) {
            return ResponseEntity.status(401).build();
        }
        User currentUser = userRepository.findById(userDetails.getId())
                .orElseThrow(() -> new RuntimeException("User not found"));
        User friend = userRepository.findById(friendId).orElseThrow(() -> new RuntimeException("Friend not found"));

        List<ChatMessage> messages = chatMessageRepository
                .findBySenderAndReceiverOrReceiverAndSenderOrderByTimestampAsc(
                        currentUser, friend, currentUser, friend);

        return ResponseEntity.ok(messages);
    }
}
