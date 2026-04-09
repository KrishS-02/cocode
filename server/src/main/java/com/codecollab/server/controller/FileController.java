package com.codecollab.server.controller;

import com.codecollab.server.model.File;
import com.codecollab.server.model.User;
import com.codecollab.server.repository.FileRepository;
import com.codecollab.server.repository.UserRepository;
import com.codecollab.server.security.UserDetailsImpl;
import com.codecollab.server.service.AuditService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.util.Optional;
import java.util.UUID;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/files")
public class FileController {

    @Autowired
    private FileRepository fileRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AuditService auditService;

    @PutMapping("/{id}")
    public ResponseEntity<?> updateFile(@PathVariable UUID id, @Valid @RequestBody FileRequest request) {
        File file = fileRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("File not found"));
        file.setContent(request.getContent());
        fileRepository.save(file);

        // Audit log — use JPQL query to avoid lazy-loading the File.environment proxy
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            Optional<UUID> envIdOpt = fileRepository.findEnvironmentIdByFileId(id);
            if (auth != null && auth.getPrincipal() instanceof UserDetailsImpl userDetails && envIdOpt.isPresent()) {
                // Resolve username for a human-readable log entry
                String username = userRepository.findById(userDetails.getId())
                        .map(User::getUsername)
                        .orElse("Unknown user");
                auditService.logAction(userDetails.getId(), "FILE_SAVED",
                        envIdOpt.get().toString(),
                        "\"" + username + "\" saved file: " + file.getName());
            }
        } catch (Exception e) {
            System.err.println("[FileController] Audit log failed: " + e.getMessage());
        }

        return ResponseEntity.ok(file);
    }
}

class FileRequest {
    @NotNull(message = "Content cannot be null")
    private String content;

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }
}
