package com.codecollab.server.controller;

import com.codecollab.server.handler.ChatWebSocketHandler;
import com.codecollab.server.model.ChatMessage;
import com.codecollab.server.model.Group;
import com.codecollab.server.model.GroupMember;
import com.codecollab.server.model.User;
import com.codecollab.server.repository.ChatMessageRepository;
import com.codecollab.server.repository.EnvironmentRepository;
import com.codecollab.server.repository.GroupMemberRepository;
import com.codecollab.server.repository.GroupRepository;
import com.codecollab.server.repository.UserRepository;
import com.codecollab.server.security.UserDetailsImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/groups")
public class GroupController {

    @Autowired
    private GroupRepository groupRepository;

    @Autowired
    private GroupMemberRepository groupMemberRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ChatMessageRepository chatMessageRepository;

    @Autowired
    private ChatWebSocketHandler chatWebSocketHandler;

    @Autowired
    private com.codecollab.server.service.AuditService auditService;

    @Autowired
    private EnvironmentRepository environmentRepository;

    @PostMapping
    public ResponseEntity<?> createGroup(@Valid @RequestBody CreateGroupRequest request,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        String name = request.getName();
        String description = request.getDescription();

        User owner = userRepository.findById(userDetails.getId())
                .orElseThrow(() -> new RuntimeException("User not found"));

        Group group = new Group(name, description, owner);
        groupRepository.save(group);

        GroupMember member = new GroupMember(group, owner, GroupMember.Role.ADMIN);
        groupMemberRepository.save(member);

        auditService.logAction(owner.getId(), "GROUP_CREATED", group.getId().toString(), "Created group: " + name);

        return ResponseEntity.ok(group);
    }

    @GetMapping
    public ResponseEntity<List<Group>> getMyGroups(@AuthenticationPrincipal UserDetailsImpl userDetails) {
        User user = userRepository.findById(userDetails.getId()).orElseThrow();
        List<GroupMember> memberships = groupMemberRepository.findByUser(user);
        List<Group> groups = memberships.stream().map(GroupMember::getGroup).collect(Collectors.toList());
        return ResponseEntity.ok(groups);
    }

    @GetMapping("/{groupId}/members")
    public ResponseEntity<List<GroupMember>> getGroupMembers(@PathVariable UUID groupId) {
        Group group = groupRepository.findById(groupId).orElseThrow(() -> new RuntimeException("Group not found"));
        return ResponseEntity.ok(groupMemberRepository.findByGroup(group));
    }

    @PostMapping("/{groupId}/members")
    public ResponseEntity<?> addMember(@PathVariable UUID groupId, @Valid @RequestBody AddMemberRequest request,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        Group group = groupRepository.findById(groupId).orElseThrow(() -> new RuntimeException("Group not found"));

        // Verify requester is ADMIN or owner? Or strictly existing member?
        // Ideally only existing members can add? Or just admins?
        // For simplicity: Any member can add for now, or just ADMIN.
        // Let's check if requester is member.
        User requester = userRepository.findById(userDetails.getId()).orElseThrow();

        boolean isMember = groupMemberRepository.findByGroupAndUser(group, requester).isPresent();
        if (!isMember) {
            return ResponseEntity.status(403).body("Not a member of this group");
        }

        UUID userId = request.getUserId();
        User userToAdd = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User to add not found"));

        if (groupMemberRepository.findByGroupAndUser(group, userToAdd).isPresent()) {
            return ResponseEntity.badRequest().body("User already in group");
        }

        GroupMember newMember = new GroupMember(group, userToAdd, GroupMember.Role.MEMBER);
        groupMemberRepository.save(newMember);

        auditService.logAction(requester.getId(), "GROUP_MEMBER_ADDED", group.getId().toString(),
                "Added user " + userToAdd.getUsername() + " to group");

        // Notify group?
        // chatWebSocketHandler.sendGroupEvent(groupId, "MEMBER_ADDED", ...);

        return ResponseEntity.ok(newMember);
    }

    @DeleteMapping("/{groupId}/members/{userId}")
    public ResponseEntity<?> removeMember(@PathVariable UUID groupId, @PathVariable UUID userId,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        Group group = groupRepository.findById(groupId).orElseThrow(() -> new RuntimeException("Group not found"));
        User userToRemove = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
        User requester = userRepository.findById(userDetails.getId()).orElseThrow();

        GroupMember requesterMember = groupMemberRepository.findByGroupAndUser(group, requester)
                .orElseThrow(() -> new RuntimeException("You are not a member"));

        // Validations:
        // 1. Admin can remove others.
        // 2. User can remove themselves (leave).

        if (!requester.getId().equals(userToRemove.getId()) && requesterMember.getRole() != GroupMember.Role.ADMIN) {
            return ResponseEntity.status(403).body("Only Admins can remove other members");
        }

        GroupMember memberToRemove = groupMemberRepository.findByGroupAndUser(group, userToRemove)
                .orElseThrow(() -> new RuntimeException("User is not a member"));

        groupMemberRepository.delete(memberToRemove);

        return ResponseEntity.ok("Member removed");
    }

    @GetMapping("/{groupId}/messages")
    public ResponseEntity<List<ChatMessage>> getGroupMessages(@PathVariable UUID groupId,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        Group group = groupRepository.findById(groupId).orElseThrow(() -> new RuntimeException("Group not found"));
        User requester = userRepository.findById(userDetails.getId()).orElseThrow();

        if (groupMemberRepository.findByGroupAndUser(group, requester).isEmpty()) {
            return ResponseEntity.status(403).build();
        }

        return ResponseEntity.ok(chatMessageRepository.findByGroupIdOrderByTimestampAsc(groupId));
    }

    @DeleteMapping("/{groupId}/members/me")
    public ResponseEntity<?> leaveGroup(@PathVariable UUID groupId,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        Group group = groupRepository.findById(groupId).orElseThrow(() -> new RuntimeException("Group not found"));
        User requester = userRepository.findById(userDetails.getId()).orElseThrow();

        GroupMember membership = groupMemberRepository.findByGroupAndUser(group, requester)
                .orElseThrow(() -> new RuntimeException("You are not a member of this group"));

        // Owner cannot leave — must transfer ownership or delete group
        if (membership.getRole() == GroupMember.Role.ADMIN && group.getOwner().getId().equals(requester.getId())) {
            long adminCount = groupMemberRepository.findByGroup(group).stream()
                    .filter(m -> m.getRole() == GroupMember.Role.ADMIN).count();
            if (adminCount == 1) {
                return ResponseEntity.badRequest().body("You are the only admin. Transfer ownership before leaving.");
            }
        }

        groupMemberRepository.delete(membership);
        auditService.logAction(requester.getId(), "GROUP_LEFT", groupId.toString(),
                requester.getUsername() + " left the group");
        return ResponseEntity.ok("Left group successfully");
    }

    @GetMapping("/{groupId}/environments")
    public ResponseEntity<?> getGroupEnvironments(@PathVariable UUID groupId,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        Group group = groupRepository.findById(groupId).orElseThrow(() -> new RuntimeException("Group not found"));
        User requester = userRepository.findById(userDetails.getId()).orElseThrow();

        if (groupMemberRepository.findByGroupAndUser(group, requester).isEmpty()) {
            return ResponseEntity.status(403).body("Not a member of this group");
        }

        List<com.codecollab.server.model.Environment> environments = environmentRepository.findByGroupId(groupId);
        return ResponseEntity.ok(environments);
    }

    public static class CreateGroupRequest {
        @NotBlank(message = "Group name is required")
        @Size(max = 50, message = "Group name cannot exceed 50 characters")
        private String name;

        private String description;

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public String getDescription() {
            return description;
        }

        public void setDescription(String description) {
            this.description = description;
        }
    }

    public static class AddMemberRequest {
        @NotNull(message = "User ID is required")
        private UUID userId;

        public UUID getUserId() {
            return userId;
        }

        public void setUserId(UUID userId) {
            this.userId = userId;
        }
    }
}
