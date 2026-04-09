package com.codecollab.server.repository;

import com.codecollab.server.model.Environment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface EnvironmentRepository extends JpaRepository<Environment, UUID> {
    List<Environment> findByOwnerId(UUID ownerId);

    @org.springframework.data.jpa.repository.Query("SELECT DISTINCT e FROM Environment e WHERE e.owner.id = :userId OR e.id IN (SELECT p.environment.id FROM EnvironmentPermission p WHERE p.user.id = :userId) OR e.groupId IN (SELECT gm.group.id FROM GroupMember gm WHERE gm.user.id = :userId AND gm.group.id IS NOT NULL)")
    List<Environment> findByOwnerIdOrHasPermission(@org.springframework.data.repository.query.Param("userId") UUID userId);

    Optional<Environment> findByJoinCode(String joinCode);

    List<Environment> findByGroupId(UUID groupId);
}
