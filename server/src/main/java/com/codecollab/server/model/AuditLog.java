package com.codecollab.server.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "audit_logs")
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "actor_id", nullable = false)
    private UUID actorId;

    @Column(nullable = false)
    private String action;

    @Column(name = "target_id")
    private String targetId;

    @Column(columnDefinition = "TEXT")
    private String details;

    @Column(nullable = false, updatable = false)
    private Instant timestamp;

    public AuditLog() {
        this.timestamp = Instant.now();
    }

    public AuditLog(UUID actorId, String action, String targetId, String details) {
        this.actorId = actorId;
        this.action = action;
        this.targetId = targetId;
        this.details = details;
        this.timestamp = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getActorId() {
        return actorId;
    }

    public void setActorId(UUID actorId) {
        this.actorId = actorId;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public String getTargetId() {
        return targetId;
    }

    public void setTargetId(String targetId) {
        this.targetId = targetId;
    }

    public String getDetails() {
        return details;
    }

    public void setDetails(String details) {
        this.details = details;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(Instant timestamp) {
        this.timestamp = timestamp;
    }
}
