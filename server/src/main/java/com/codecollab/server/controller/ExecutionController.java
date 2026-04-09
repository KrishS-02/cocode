package com.codecollab.server.controller;

import com.codecollab.server.service.AuditService;
import com.codecollab.server.service.CodeExecutionService;
import com.codecollab.server.service.EnvironmentPermissionService;
import com.codecollab.server.model.EnvironmentPermission;
import com.codecollab.server.model.User;
import com.codecollab.server.repository.UserRepository;
import com.codecollab.server.security.UserDetailsImpl;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/execute")
public class ExecutionController {

    @Autowired
    private CodeExecutionService executionService;

    @Autowired
    private EnvironmentPermissionService permissionService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AuditService auditService;

    @PostMapping
    public ResponseEntity<String> executeCode(@Valid @RequestBody ExecutionRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {
        UserDetailsImpl userDetailsImpl = (UserDetailsImpl) userDetails;
        User user = userRepository.findById(userDetailsImpl.getId())
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Check permission: Must be at least EDITOR
        if (!permissionService.hasPermission(request.getEnvironmentId(), user.getId(),
                EnvironmentPermission.AccessLevel.EDITOR)) {
            return ResponseEntity.status(403).body("You do not have permission to execute code in this environment.");
        }

        String output = executionService.executePython(request.getCode());

        // Audit log the execution
        try {
            auditService.logAction(user.getId(), "CODE_EXECUTED",
                    request.getEnvironmentId().toString(),
                    "\"" + user.getUsername() + "\" ran the code");
        } catch (Exception e) {
            System.err.println("[ExecutionController] Audit log failed: " + e.getMessage());
        }

        return ResponseEntity.ok(output);
    }

    @Data
    public static class ExecutionRequest {
        @NotBlank(message = "Code cannot be empty")
        private String code;

        @NotNull(message = "Environment ID cannot be null")
        private UUID environmentId;
    }
}
