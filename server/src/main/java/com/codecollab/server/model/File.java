package com.codecollab.server.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.GenericGenerator;

import java.util.UUID;

@Entity
@Table(name = "files")
@Data
@NoArgsConstructor
public class File {
    @Id
    @GeneratedValue(generator = "UUID")
    @GenericGenerator(name = "UUID", strategy = "org.hibernate.id.UUIDGenerator")
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String content;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "environment_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Environment environment;

    public File(String name, String content, Environment environment) {
        this.name = name;
        this.content = content;
        this.environment = environment;
    }
}
