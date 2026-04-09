package com.codecollab.server.repository;

import com.codecollab.server.model.Group;
import com.codecollab.server.model.GroupMember;
import com.codecollab.server.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface GroupMemberRepository extends JpaRepository<GroupMember, UUID> {
    List<GroupMember> findByUser(User user);

    List<GroupMember> findByGroup(Group group);

    // Find all users in a group
    Optional<GroupMember> findByGroupAndUser(Group group, User user);
}
