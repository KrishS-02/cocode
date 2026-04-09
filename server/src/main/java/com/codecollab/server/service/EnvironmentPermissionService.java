package com.codecollab.server.service;

import com.codecollab.server.model.Environment;
import com.codecollab.server.model.EnvironmentPermission;
import com.codecollab.server.model.User;
import com.codecollab.server.repository.EnvironmentPermissionRepository;
import com.codecollab.server.repository.EnvironmentRepository;
import com.codecollab.server.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class EnvironmentPermissionService {

    @Autowired
    private EnvironmentPermissionRepository permissionRepository;

    @Autowired
    private EnvironmentRepository environmentRepository;

    @Autowired
    private UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<EnvironmentPermission> getPermissions(UUID environmentId) {
        List<EnvironmentPermission> perms = new java.util.ArrayList<>(permissionRepository.findByEnvironmentId(environmentId));
        Environment environment = environmentRepository.findById(environmentId).orElse(null);
        if (environment != null && environment.getOwner() != null) {
            boolean ownerFound = perms.stream().anyMatch(p -> p.getUser().getId().equals(environment.getOwner().getId()));
            if (!ownerFound) {
                User fullOwner = userRepository.findById(environment.getOwner().getId()).orElse(null);
                if (fullOwner != null) {
                    EnvironmentPermission ownerPerm = new EnvironmentPermission();
                    ownerPerm.setId(UUID.randomUUID());
                    ownerPerm.setEnvironment(environment);
                    ownerPerm.setUser(fullOwner);
                    ownerPerm.setAccessLevel(EnvironmentPermission.AccessLevel.ADMIN);
                    perms.add(0, ownerPerm);
                }
            }
        }
        return perms;
    }

    @Transactional
    public EnvironmentPermission grantPermission(UUID environmentId, String usernameOrEmail,
            EnvironmentPermission.AccessLevel content) {
        Environment environment = environmentRepository.findById(environmentId)
                .orElseThrow(() -> new RuntimeException("Environment not found"));

        // Try standard finders first
        Optional<User> userOpt = userRepository.findByUsernameIgnoreCase(usernameOrEmail.trim())
                .or(() -> userRepository.findByEmailIgnoreCase(usernameOrEmail.trim()));

        // Fallback: If query fails but user exists (weird DB/JPA issue), iterate and
        // find.
        User user = userOpt.orElseGet(() -> {
            return userRepository.findAll().stream()
                    .filter(u -> u.getUsername().trim().equalsIgnoreCase(usernameOrEmail.trim()) ||
                            u.getEmail().trim().equalsIgnoreCase(usernameOrEmail.trim()))
                    .findFirst()
                    .orElseThrow(() -> new RuntimeException("User not found: " + usernameOrEmail));
        });

        Optional<EnvironmentPermission> existingPermission = permissionRepository
                .findByEnvironmentIdAndUserId(environmentId, user.getId());

        if (existingPermission.isPresent()) {
            EnvironmentPermission permission = existingPermission.get();
            permission.setAccessLevel(content);
            return permissionRepository.save(permission);
        } else {
            EnvironmentPermission permission = new EnvironmentPermission(environment, user, content);
            return permissionRepository.save(permission);
        }
    }

    @Transactional
    public EnvironmentPermission grantPermissionByUser(UUID environmentId, User user,
            EnvironmentPermission.AccessLevel accessLevel) {
        Environment environment = environmentRepository.findById(environmentId)
                .orElseThrow(() -> new RuntimeException("Environment not found"));

        Optional<EnvironmentPermission> existing = permissionRepository
                .findByEnvironmentIdAndUserId(environmentId, user.getId());

        if (existing.isPresent()) {
            EnvironmentPermission perm = existing.get();
            perm.setAccessLevel(accessLevel);
            return permissionRepository.save(perm);
        } else {
            EnvironmentPermission perm = new EnvironmentPermission(environment, user, accessLevel);
            return permissionRepository.save(perm);
        }
    }

    public boolean hasAnyPermission(UUID environmentId, UUID userId) {
        return permissionRepository.findByEnvironmentIdAndUserId(environmentId, userId).isPresent();
    }

    @Transactional
    public void revokePermission(UUID environmentId, UUID userId) {
        permissionRepository.deleteByEnvironmentIdAndUserId(environmentId, userId);
    }

    @Transactional(readOnly = true)
    public EnvironmentPermission.AccessLevel getUserAccessLevel(UUID environmentId, UUID userId) {
        Environment environment = environmentRepository.findById(environmentId)
                .orElseThrow(() -> new RuntimeException("Environment not found"));

        if (environment.getOwner().getId().equals(userId)) {
            return EnvironmentPermission.AccessLevel.ADMIN;
        }

        return permissionRepository.findByEnvironmentIdAndUserId(environmentId, userId)
                .map(EnvironmentPermission::getAccessLevel)
                .orElse(null);
    }

    public boolean hasPermission(UUID environmentId, UUID userId, EnvironmentPermission.AccessLevel requiredLevel) {
        EnvironmentPermission.AccessLevel actualLevel = getUserAccessLevel(environmentId, userId);
        if (actualLevel == null)
            return false;

        if (requiredLevel == EnvironmentPermission.AccessLevel.VIEWER)
            return true; // Any level covers VIEWER
        if (requiredLevel == EnvironmentPermission.AccessLevel.EDITOR)
            return actualLevel == EnvironmentPermission.AccessLevel.EDITOR
                    || actualLevel == EnvironmentPermission.AccessLevel.ADMIN;
        if (requiredLevel == EnvironmentPermission.AccessLevel.ADMIN)
            return actualLevel == EnvironmentPermission.AccessLevel.ADMIN;

        return false;
    }

    @Transactional
    public void delegateExaminee(UUID environmentId, UUID examineeId) {
        List<EnvironmentPermission> perms = permissionRepository.findByEnvironmentId(environmentId);
        
        for (EnvironmentPermission perm : perms) {
            if (perm.getAccessLevel() == EnvironmentPermission.AccessLevel.ADMIN) {
                continue; // Admins keep their rights
            }
            if (perm.getUser().getId().equals(examineeId)) {
                perm.setAccessLevel(EnvironmentPermission.AccessLevel.EDITOR);
            } else {
                perm.setAccessLevel(EnvironmentPermission.AccessLevel.VIEWER);
            }
            permissionRepository.save(perm);
        }
    }

    @Transactional
    public void lockAllToViewer(UUID environmentId) {
        List<EnvironmentPermission> perms = permissionRepository.findByEnvironmentId(environmentId);
        for (EnvironmentPermission perm : perms) {
            if (perm.getAccessLevel() != EnvironmentPermission.AccessLevel.ADMIN) {
                perm.setAccessLevel(EnvironmentPermission.AccessLevel.VIEWER);
                permissionRepository.save(perm);
            }
        }
    }
}
