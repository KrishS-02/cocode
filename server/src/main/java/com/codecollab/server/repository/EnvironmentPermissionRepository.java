package com.codecollab.server.repository;

import com.codecollab.server.model.EnvironmentPermission;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface EnvironmentPermissionRepository extends JpaRepository<EnvironmentPermission, UUID> {
    List<EnvironmentPermission> findByEnvironmentId(UUID environmentId);

    Optional<EnvironmentPermission> findByEnvironmentIdAndUserId(UUID environmentId, UUID userId);

    void deleteByEnvironmentIdAndUserId(UUID environmentId, UUID userId);
}
