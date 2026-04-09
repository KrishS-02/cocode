package com.codecollab.server.controller;

import com.codecollab.server.model.EnvironmentPermission;
import com.codecollab.server.model.User;
import com.codecollab.server.service.EnvironmentPermissionService;
import com.codecollab.server.repository.UserRepository;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.UUID;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/environments/{environmentId}/permissions")
public class EnvironmentPermissionController {

    @Autowired
    private EnvironmentPermissionService permissionService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private com.codecollab.server.service.AuditService auditService;

    @Autowired
    private com.codecollab.server.service.NotificationService notificationService;

    @Autowired
    private com.codecollab.server.repository.EnvironmentRepository environmentRepository;

    @GetMapping
    public ResponseEntity<List<EnvironmentPermission>> getPermissions(@PathVariable UUID environmentId) {
        return ResponseEntity.ok(permissionService.getPermissions(environmentId));
    }

    @PostMapping
    public ResponseEntity<?> grantPermission(@PathVariable UUID environmentId, @Valid @RequestBody GrantRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {
        // Verify requestor is ADMIN (owner)
        User requestor = userRepository.findById(((com.codecollab.server.security.UserDetailsImpl) userDetails).getId())
                .orElseThrow(() -> new RuntimeException("User not found"));
        if (!permissionService.hasPermission(environmentId, requestor.getId(),
                EnvironmentPermission.AccessLevel.ADMIN)) {
            return ResponseEntity.status(403).body("Only Admins can grant permissions.");
        }

        try {
            EnvironmentPermission permission = permissionService.grantPermission(environmentId,
                    request.getUsernameOrEmail(), request.getAccessLevel());

            auditService.logAction(requestor.getId(), "PERMISSION_CHANGED", environmentId.toString(),
                    "Granted " + request.getAccessLevel() + " to " + request.getUsernameOrEmail());

            // Broadcast access level change over WebSockets
            try {
                com.codecollab.server.model.User targetUser = userRepository
                        .findByUsernameIgnoreCase(request.getUsernameOrEmail().trim())
                        .or(() -> userRepository.findByEmailIgnoreCase(request.getUsernameOrEmail().trim()))
                        .orElse(null);
                
                if (targetUser != null && permission != null) {
                    com.codecollab.server.handler.ChatWebSocketHandler chatWebSocketHandler = org.springframework.web.context.support.WebApplicationContextUtils
                        .getRequiredWebApplicationContext(
                            ((org.springframework.web.context.request.ServletRequestAttributes) org.springframework.web.context.request.RequestContextHolder.getRequestAttributes()).getRequest().getServletContext()
                        ).getBean(com.codecollab.server.handler.ChatWebSocketHandler.class);
                        
                    chatWebSocketHandler.sendEvent(targetUser.getId(), "PERMISSION_UPDATED", java.util.Map.of(
                            "environmentId", environmentId.toString(),
                            "accessLevel", request.getAccessLevel().toString()
                    ));
                }
            } catch (Exception wsEx) {
                wsEx.printStackTrace();
            }

            // Fire a real-time notification — look up user fresh from DB (not via detached
            // proxy)
            try {
                com.codecollab.server.model.User invitedUser = userRepository
                        .findByUsernameIgnoreCase(request.getUsernameOrEmail().trim())
                        .or(() -> userRepository.findByEmailIgnoreCase(request.getUsernameOrEmail().trim()))
                        .orElse(null);
                com.codecollab.server.model.Environment env = environmentRepository.findById(environmentId)
                        .orElse(null);
                if (invitedUser != null && env != null) {
                    notificationService.createAndSend(
                            invitedUser.getId(),
                            requestor.getUsername() + " added you to '" + env.getName() + "' as "
                                    + request.getAccessLevel(),
                            "/editor/" + environmentId);
                }
            } catch (Exception notifEx) {
                // Notification failure must never prevent the permission from being granted
                notifEx.printStackTrace();
            }

            return ResponseEntity.ok(permission);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }

    }

    @DeleteMapping("/{userId}")
    public ResponseEntity<?> revokePermission(@PathVariable UUID environmentId, @PathVariable UUID userId,
            @AuthenticationPrincipal UserDetails userDetails) {
        // Verify requestor is ADMIN (owner)
        User requestor = userRepository.findById(((com.codecollab.server.security.UserDetailsImpl) userDetails).getId())
                .orElseThrow(() -> new RuntimeException("User not found"));
        if (!permissionService.hasPermission(environmentId, requestor.getId(),
                EnvironmentPermission.AccessLevel.ADMIN)) {
            return ResponseEntity.status(403).body("Only Admins can revoke permissions.");
        }

        permissionService.revokePermission(environmentId, userId);

        auditService.logAction(requestor.getId(), "PERMISSION_REVOKED", environmentId.toString(),
                "Revoked permission for user ID: " + userId);

        try {
            com.codecollab.server.handler.ChatWebSocketHandler chatWebSocketHandler = org.springframework.web.context.support.WebApplicationContextUtils
                .getRequiredWebApplicationContext(
                    ((org.springframework.web.context.request.ServletRequestAttributes) org.springframework.web.context.request.RequestContextHolder.getRequestAttributes()).getRequest().getServletContext()
                ).getBean(com.codecollab.server.handler.ChatWebSocketHandler.class);
                
            chatWebSocketHandler.sendEvent(userId, "PERMISSION_UPDATED", java.util.Map.of(
                    "environmentId", environmentId.toString(),
                    "accessLevel", "REVOKED"
            ));
        } catch (Exception wsEx) {
            wsEx.printStackTrace();
        }

        return ResponseEntity.ok("Permission revoked.");
    }

    @GetMapping("/me")
    public ResponseEntity<?> getMyPermission(@PathVariable UUID environmentId,
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userRepository.findById(((com.codecollab.server.security.UserDetailsImpl) userDetails).getId())
                .orElseThrow(() -> new RuntimeException("User not found"));
        EnvironmentPermission.AccessLevel level = permissionService.getUserAccessLevel(environmentId, user.getId());
        return ResponseEntity.ok(level);
    }

    @PostMapping("/delegate-examinee")
    public ResponseEntity<?> delegateExaminee(@PathVariable UUID environmentId, @RequestBody java.util.Map<String, String> payload,
                                              @AuthenticationPrincipal UserDetails userDetails) {
        User requestor = userRepository.findById(((com.codecollab.server.security.UserDetailsImpl) userDetails).getId())
                .orElseThrow(() -> new RuntimeException("User not found"));
        if (!permissionService.hasPermission(environmentId, requestor.getId(),
                EnvironmentPermission.AccessLevel.ADMIN)) {
            return ResponseEntity.status(403).body("Only Admins can delegate examinee.");
        }

        String userIdStr = payload.get("userId");
        if (userIdStr == null) {
            return ResponseEntity.badRequest().body("userId is required.");
        }

        UUID examineeId = UUID.fromString(userIdStr);
        permissionService.delegateExaminee(environmentId, examineeId);

        auditService.logAction(requestor.getId(), "EXAMINEE_DELEGATED", environmentId.toString(),
                "Delegated EXAMINEE role exclusively to user ID: " + examineeId);

        // Notify the examinee via Notification
        try {
            com.codecollab.server.model.Environment env = environmentRepository.findById(environmentId).orElse(null);
            if (env != null) {
                notificationService.createAndSend(
                        examineeId,
                        "📝 You've been assigned as Examinee in '" + env.getName() + "'. Read the problem statement and start coding!",
                        "/editor/" + environmentId
                );
            }
        } catch (Exception notifEx) {
            notifEx.printStackTrace();
        }

        // Broadcast updated permissions to all users in the environment
        try {
            com.codecollab.server.handler.ChatWebSocketHandler chatWebSocketHandler = org.springframework.web.context.support.WebApplicationContextUtils
                    .getRequiredWebApplicationContext(
                            ((org.springframework.web.context.request.ServletRequestAttributes) org.springframework.web.context.request.RequestContextHolder.getRequestAttributes()).getRequest().getServletContext()
                    ).getBean(com.codecollab.server.handler.ChatWebSocketHandler.class);

            List<EnvironmentPermission> members = permissionService.getPermissions(environmentId);
            for (EnvironmentPermission perm : members) {
                chatWebSocketHandler.sendEvent(perm.getUser().getId(), "PERMISSION_UPDATED", java.util.Map.of(
                        "environmentId", environmentId.toString(),
                        "accessLevel", perm.getAccessLevel().toString()
                ));
                // Also send EXAMINEE_ASSIGNED so the assigned user gets a contextual UI prompt
                if (perm.getUser().getId().equals(examineeId)) {
                    chatWebSocketHandler.sendEvent(perm.getUser().getId(), "EXAMINEE_ASSIGNED", java.util.Map.of(
                            "environmentId", environmentId.toString()
                    ));
                }
            }
        } catch (Exception wsEx) {
            wsEx.printStackTrace();
        }

        return ResponseEntity.ok("Examinee delegated successfully.");
    }

    @Data
    public static class GrantRequest {
        @NotBlank(message = "Username or Email cannot be empty")
        private String usernameOrEmail;

        @NotNull(message = "Access level must be provided")
        private EnvironmentPermission.AccessLevel accessLevel;
    }
}
