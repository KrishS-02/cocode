package com.codecollab.server.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Entity
@Table(name = "environment_permissions", uniqueConstraints = {
        @UniqueConstraint(columnNames = { "environment_id", "user_id" })
})
@Data
@NoArgsConstructor
public class EnvironmentPermission {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "environment_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Environment environment;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AccessLevel accessLevel;

    public enum AccessLevel {
        VIEWER,
        EDITOR,
        ADMIN
    }

    public EnvironmentPermission(Environment environment, User user, AccessLevel accessLevel) {
        this.environment = environment;
        this.user = user;
        this.accessLevel = accessLevel;
    }
}
