package com.codecollab.server.repository;

import com.codecollab.server.model.File;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface FileRepository extends JpaRepository<File, UUID> {
    List<File> findByEnvironmentId(UUID environmentId);

    @org.springframework.data.jpa.repository.Query("SELECT f.environment.id FROM File f WHERE f.id = :fileId")
    java.util.Optional<UUID> findEnvironmentIdByFileId(UUID fileId);
}
