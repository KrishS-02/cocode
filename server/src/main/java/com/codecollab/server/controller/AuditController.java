package com.codecollab.server.controller;

import com.codecollab.server.model.AuditLog;
import com.codecollab.server.model.EnvironmentPermission;
import com.codecollab.server.model.User;
import com.codecollab.server.repository.UserRepository;
import com.codecollab.server.service.AuditService;
import com.codecollab.server.service.EnvironmentPermissionService;
import com.codecollab.server.security.UserDetailsImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/admin/logs")
public class AuditController {

    @Autowired
    private AuditService auditService;

    @Autowired
    private EnvironmentPermissionService permissionService;

    @Autowired
    private UserRepository userRepository;

    @GetMapping("/{environmentId}")
    public ResponseEntity<?> getLogs(@PathVariable UUID environmentId,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {

        User requestor = userRepository.findById(userDetails.getId())
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (!permissionService.hasPermission(environmentId, requestor.getId(),
                EnvironmentPermission.AccessLevel.ADMIN)) {
            return ResponseEntity.status(403).body("Only Admins can view audit logs.");
        }

        List<AuditLog> logs = auditService.getEnvironmentLogs(environmentId.toString());
        return ResponseEntity.ok(logs);
    }
}
