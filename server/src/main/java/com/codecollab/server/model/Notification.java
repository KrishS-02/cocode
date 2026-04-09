package com.codecollab.server.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "notifications")
@Data
@NoArgsConstructor
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private String message;

    private String linkUrl;

    // Using 'read' as field name to avoid Lombok boolean "is" prefix getter
    // collision with Spring Data JPA.
    // Jackson @JsonProperty ensures it serializes as "isRead" for frontend
    // compatibility.
    @JsonProperty("isRead")
    @Column(name = "is_read", nullable = false)
    private boolean read = false;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now(java.time.ZoneOffset.UTC);
    }

    public Notification(UUID userId, String message, String linkUrl) {
        this.userId = userId;
        this.message = message;
        this.linkUrl = linkUrl;
    }
}
