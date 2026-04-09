package com.codecollab.server.controller;

import com.codecollab.server.handler.ChatWebSocketHandler;
import com.codecollab.server.model.Environment;
import com.codecollab.server.model.EnvironmentPermission;
import com.codecollab.server.model.File;
import com.codecollab.server.model.User;
import com.codecollab.server.repository.EnvironmentRepository;
import com.codecollab.server.repository.FileRepository;
import com.codecollab.server.repository.UserRepository;
import com.codecollab.server.security.UserDetailsImpl;
import com.codecollab.server.service.AuditService;
import com.codecollab.server.service.EnvironmentPermissionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.Optional;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/environments")
public class EnvironmentController {

    @Autowired
    private EnvironmentRepository environmentRepository;

    @Autowired
    private FileRepository fileRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AuditService auditService;

    @Autowired
    private EnvironmentPermissionService permissionService;

    @Autowired
    private ChatWebSocketHandler chatWebSocketHandler;

    @PostMapping
    public ResponseEntity<?> createEnvironment(@Valid @RequestBody EnvironmentRequest request) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        UserDetailsImpl userDetails = (UserDetailsImpl) authentication.getPrincipal();
        User owner = userRepository.findById(userDetails.getId())
                .orElseThrow(() -> new RuntimeException("User not found"));

        Environment env = new Environment(request.getName(), request.getDescription(), owner);
        if (request.getGroupId() != null) {
            env.setGroupId(request.getGroupId());
        }
        // Create a default file
        File defaultFile = new File("main.py", "print('Hello World')", env);
        env.getFiles().add(defaultFile);

        Environment savedEnv = environmentRepository.save(env);
        permissionService.grantPermissionByUser(savedEnv.getId(), owner, EnvironmentPermission.AccessLevel.ADMIN);

        auditService.logAction(owner.getId(), "ENVIRONMENT_CREATED", savedEnv.getId().toString(),
                "Created environment: " + request.getName());

        return ResponseEntity.ok(savedEnv);
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getEnvironment(@PathVariable UUID id) {
        Environment env = environmentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Environment not found"));
        // Lazy migration: generate joinCode for environments created before Sprint 11
        if (env.getJoinCode() == null || env.getJoinCode().isBlank()) {
            String code;
            String chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            java.util.Random random = new java.util.Random();
            do {
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < 6; i++)
                    sb.append(chars.charAt(random.nextInt(chars.length())));
                code = sb.toString();
            } while (environmentRepository.findByJoinCode(code).isPresent());
            env.setJoinCode(code);
            env = environmentRepository.save(env);
        }
        return ResponseEntity.ok(env);
    }

    @GetMapping("/my")
    public ResponseEntity<?> getMyEnvironments() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        UserDetailsImpl userDetails = (UserDetailsImpl) authentication.getPrincipal();
        List<Environment> envs = environmentRepository.findByOwnerIdOrHasPermission(userDetails.getId());
        return ResponseEntity.ok(envs);
    }

    @PutMapping("/{id}/whiteboard")
    public ResponseEntity<?> saveWhiteboard(@PathVariable UUID id, @Valid @RequestBody WhiteboardRequest request) {
        Environment env = environmentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Environment not found"));
        env.setWhiteboardData(request.getData());
        environmentRepository.save(env);
        return ResponseEntity.ok("Whiteboard saved");
    }

    /**
     * POST /api/environments/join-by-code
     * Body: { "code": "ABC123" }
     * Adds the requesting user as VIEWER to the environment, logs the action, and
     * broadcasts PARTICIPANT_JOINED to all existing members.
     */
    @PostMapping("/join-by-code")
    public ResponseEntity<?> joinByCode(@Valid @RequestBody JoinByCodeRequest request) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        UserDetailsImpl userDetails = (UserDetailsImpl) authentication.getPrincipal();
        User joiningUser = userRepository.findById(userDetails.getId())
                .orElseThrow(() -> new RuntimeException("User not found"));

        Environment env = environmentRepository.findByJoinCode(request.getCode().toUpperCase().trim())
                .orElse(null);

        if (env == null) {
            return ResponseEntity.status(404).body(Map.of("error", "Invalid join code. No environment found."));
        }

        // If owner, redirect immediately without needing a permission entry
        if (env.getOwnerId() != null && env.getOwnerId().equals(joiningUser.getId())) {
            return ResponseEntity.ok(env);
        }

        // Check if user already has access
        if (permissionService.hasAnyPermission(env.getId(), joiningUser.getId())) {
            return ResponseEntity.ok(env); // Already has access, just return env
        }

        // Add user as VIEWER
        permissionService.grantPermissionByUser(env.getId(), joiningUser, EnvironmentPermission.AccessLevel.VIEWER);

        // Audit log
        auditService.logAction(joiningUser.getId(), "JOINED_VIA_CODE", env.getId().toString(),
                joiningUser.getUsername() + " joined environment '" + env.getName() + "' via join code");

        // Broadcast PARTICIPANT_JOINED to existing members
        List<EnvironmentPermission> members = permissionService.getPermissions(env.getId());
        Map<String, Object> event = Map.of(
                "environmentId", env.getId().toString(),
                "userId", joiningUser.getId().toString(),
                "username", joiningUser.getUsername(),
                "accessLevel", "VIEWER");

        for (EnvironmentPermission perm : members) {
            if (!perm.getUser().getId().equals(joiningUser.getId())) {
                chatWebSocketHandler.sendEvent(perm.getUser().getId(), "PARTICIPANT_JOINED", event);
            }
        }

        return ResponseEntity.ok(env);
    }

    /**
     * POST /api/environments/{id}/files
     * Body: { "name": "filename.js", "content": "..." }
     * Creates a new file in the environment.
     */
    @PostMapping("/{id}/files")
    public ResponseEntity<?> createFile(@PathVariable UUID id, @Valid @RequestBody NewFileRequest request) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        UserDetailsImpl userDetails = (UserDetailsImpl) authentication.getPrincipal();
        User user = userRepository.findById(userDetails.getId())
                .orElseThrow(() -> new RuntimeException("User not found"));

        Environment env = environmentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Environment not found"));

        // Only owner or EDITOR can create files
        if (env.getOwnerId() != null && !env.getOwnerId().equals(user.getId())) {
             if (!permissionService.hasPermission(env.getId(), user.getId(), EnvironmentPermission.AccessLevel.EDITOR) &&
                 !permissionService.hasPermission(env.getId(), user.getId(), EnvironmentPermission.AccessLevel.ADMIN)) {
                 return ResponseEntity.status(403).body(Map.of("error", "You do not have permission to create files in this environment"));
             }
        }

        File newFile = new File(request.getName(), request.getContent(), env);
        env.getFiles().add(newFile);
        
        // This will cascade save the new file
        Environment savedEnv = environmentRepository.save(env);
        
        // Find the newly saved file to return (since the ID gets generated on save)
        File savedFile = savedEnv.getFiles().stream()
                .filter(f -> f.getName().equals(request.getName()))
                .reduce((first, second) -> second) // get the last inserted if duplicates exist, though we try to prevent them
                .orElseThrow(() -> new RuntimeException("Failed to save file"));

        auditService.logAction(user.getId(), "FILE_CREATED", savedEnv.getId().toString(),
                user.getUsername() + " created file '" + newFile.getName() + "'");

        return ResponseEntity.ok(savedFile);
    }

    @PutMapping("/{id}/exam-mode")
    public ResponseEntity<?> setExamMode(@PathVariable UUID id, @RequestBody java.util.Map<String, Boolean> payload, @AuthenticationPrincipal UserDetailsImpl userDetails) {
        User requestor = userRepository.findById(userDetails.getId())
                .orElseThrow(() -> new RuntimeException("User not found"));
        
        if (!permissionService.hasPermission(id, requestor.getId(), EnvironmentPermission.AccessLevel.ADMIN)) {
            return ResponseEntity.status(403).body(Map.of("error", "Only Admins can toggle exam mode"));
        }

        Environment env = environmentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Environment not found"));
        
        Boolean isExamMode = payload.get("isExamMode");
        if (isExamMode != null) {
            env.setIsExamMode(isExamMode);
            environmentRepository.save(env);

            // When enabling exam mode: lock all non-admin permissions to VIEWER
            if (Boolean.TRUE.equals(isExamMode)) {
                permissionService.lockAllToViewer(id);
            }

            // Broadcast EXAM_MODE_TOGGLED AND individual PERMISSION_UPDATED to every member
            List<EnvironmentPermission> members = permissionService.getPermissions(id);
            for (EnvironmentPermission perm : members) {
                // Send their updated permission level
                chatWebSocketHandler.sendEvent(perm.getUser().getId(), "PERMISSION_UPDATED", Map.of(
                        "environmentId", id.toString(),
                        "accessLevel", perm.getAccessLevel().toString()
                ));
                // Also send the exam mode toggle event so UI splits
                chatWebSocketHandler.sendEvent(perm.getUser().getId(), "EXAM_MODE_TOGGLED", Map.of(
                        "environmentId", id.toString(),
                        "isExamMode", isExamMode,
                        "problemStatement", env.getProblemStatement() != null ? env.getProblemStatement() : ""
                ));
            }
        }
        return ResponseEntity.ok(Map.of("message", "Exam mode updated", "isExamMode", isExamMode));
    }

    @PutMapping("/{id}/problem")
    public ResponseEntity<?> setProblemStatement(@PathVariable UUID id, @RequestBody java.util.Map<String, String> payload, @AuthenticationPrincipal UserDetailsImpl userDetails) {
        User requestor = userRepository.findById(userDetails.getId())
                .orElseThrow(() -> new RuntimeException("User not found"));
        
        if (!permissionService.hasPermission(id, requestor.getId(), EnvironmentPermission.AccessLevel.ADMIN)) {
            return ResponseEntity.status(403).body(Map.of("error", "Only Admins can update the problem statement"));
        }

        Environment env = environmentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Environment not found"));
        
        String problemStatement = payload.get("problemStatement");
        if (problemStatement != null) {
            env.setProblemStatement(problemStatement);
            environmentRepository.save(env);

            // Broadcast
            List<EnvironmentPermission> members = permissionService.getPermissions(id);
            for (EnvironmentPermission perm : members) {
                chatWebSocketHandler.sendEvent(perm.getUser().getId(), "PROBLEM_STATEMENT_UPDATED", Map.of(
                        "environmentId", id.toString(),
                        "problemStatement", problemStatement
                ));
            }
        }
        return ResponseEntity.ok(Map.of("message", "Problem statement updated"));
    }
}

class EnvironmentRequest {
    @NotBlank(message = "Environment name cannot be blank")
    @Size(max = 50, message = "Environment name cannot exceed 50 characters")
    private String name;

    @Size(max = 255, message = "Description cannot exceed 255 characters")
    private String description;

    private UUID groupId;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public UUID getGroupId() {
        return groupId;
    }

    public void setGroupId(UUID groupId) {
        this.groupId = groupId;
    }
}

class WhiteboardRequest {
    private String data;

    public String getData() {
        return data;
    }

    public void setData(String data) {
        this.data = data;
    }
}

class JoinByCodeRequest {
    @NotBlank(message = "Code cannot be blank")
    private String code;

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }
}

class NewFileRequest {
    @NotBlank(message = "File name cannot be blank")
    private String name;

    private String content;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }
}
