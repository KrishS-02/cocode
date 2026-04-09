package com.codecollab.server.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.GenericGenerator;

import java.util.UUID;

@Entity
@Table(name = "environments")
@Data
@NoArgsConstructor
@com.fasterxml.jackson.annotation.JsonIgnoreProperties({ "hibernateLazyInitializer", "handler" })
public class Environment {
    @Id
    @GeneratedValue(generator = "UUID")
    @GenericGenerator(name = "UUID", strategy = "org.hibernate.id.UUIDGenerator")
    private UUID id;

    @Column(nullable = false)
    private String name;

    private String description;

    @Column(columnDefinition = "TEXT")
    private String whiteboardData;

    @Column(name = "is_exam_mode")
    private Boolean isExamMode = false;

    @Column(name = "problem_statement", columnDefinition = "TEXT")
    private String problemStatement;

    // 6-character alphanumeric join code, auto-generated
    @Column(unique = true, length = 6)
    private String joinCode;

    // Optional: link this environment to a group
    @Column(name = "group_id")
    private UUID groupId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private User owner;

    @Column(name = "owner_id", insertable = false, updatable = false)
    private UUID ownerId;

    @OneToMany(mappedBy = "environment", cascade = CascadeType.ALL, orphanRemoval = true)
    private java.util.List<File> files = new java.util.ArrayList<>();

    @PrePersist
    protected void generateJoinCode() {
        if (this.joinCode == null) {
            this.joinCode = generateCode();
        }
    }

    private static String generateCode() {
        String chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        StringBuilder sb = new StringBuilder();
        java.util.Random random = new java.util.Random();
        for (int i = 0; i < 6; i++) {
            sb.append(chars.charAt(random.nextInt(chars.length())));
        }
        return sb.toString();
    }

    public Environment(String name, String description, User owner) {
        this.name = name;
        this.description = description;
        this.owner = owner;
    }
}
