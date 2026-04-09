package com.codecollab.server.repository;

import com.codecollab.server.model.Group;
import com.codecollab.server.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface GroupRepository extends JpaRepository<Group, UUID> {
    List<Group> findByOwner(User owner);
}
