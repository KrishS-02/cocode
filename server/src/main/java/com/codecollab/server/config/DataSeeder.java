package com.codecollab.server.config;

import com.codecollab.server.model.Environment;
import com.codecollab.server.model.File;
import com.codecollab.server.model.Group;
import com.codecollab.server.model.GroupMember;
import com.codecollab.server.model.User;
import com.codecollab.server.model.FriendRequest;
import com.codecollab.server.model.FriendRequestStatus;
import com.codecollab.server.repository.EnvironmentRepository;
import com.codecollab.server.repository.FileRepository;
import com.codecollab.server.repository.GroupMemberRepository;
import com.codecollab.server.repository.GroupRepository;
import com.codecollab.server.repository.UserRepository;
import com.codecollab.server.repository.FriendRequestRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;

@Configuration
public class DataSeeder implements CommandLineRunner {

    private final UserRepository userRepository;
    private final GroupRepository groupRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final EnvironmentRepository environmentRepository;
    private final FileRepository fileRepository;
    private final PasswordEncoder passwordEncoder;
    private final FriendRequestRepository friendRequestRepository;

    public DataSeeder(UserRepository userRepository,
            GroupRepository groupRepository,
            GroupMemberRepository groupMemberRepository,
            EnvironmentRepository environmentRepository,
            FileRepository fileRepository,
            PasswordEncoder passwordEncoder,
            FriendRequestRepository friendRequestRepository) {
        this.userRepository = userRepository;
        this.groupRepository = groupRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.environmentRepository = environmentRepository;
        this.fileRepository = fileRepository;
        this.passwordEncoder = passwordEncoder;
        this.friendRequestRepository = friendRequestRepository;
    }

    @Override
    @Transactional
    public void run(String... args) throws Exception {
        if (!userRepository.existsByUsername("alice") && !userRepository.existsByUsername("Alice")) {
            System.out.println("Seeding initial data...");

            String rawPassword = "password123";
            String encodedPassword = passwordEncoder.encode(rawPassword);

            // 1. Create 4 dummy users
            User alice = new User("Alice", "alice@example.com", encodedPassword);
            User bob = new User("Bob", "bob@example.com", encodedPassword);
            User charlie = new User("Charlie", "charlie@example.com", encodedPassword);
            User dave = new User("Dave", "dave@example.com", encodedPassword);

            userRepository.save(alice);
            userRepository.save(bob);
            userRepository.save(charlie);
            userRepository.save(dave);

            userRepository.save(dave);

            // 2. Create a Study Group owned by Alice (check if exists first)
            Group studyGroup = new Group("Study Group", "A group for CodeColab testing", alice);
            groupRepository.save(studyGroup);

            // Add members to Study Group
            groupMemberRepository.save(new GroupMember(studyGroup, alice, GroupMember.Role.ADMIN));
            groupMemberRepository.save(new GroupMember(studyGroup, bob, GroupMember.Role.MEMBER));
            groupMemberRepository.save(new GroupMember(studyGroup, charlie, GroupMember.Role.MEMBER));
            groupMemberRepository.save(new GroupMember(studyGroup, dave, GroupMember.Role.MEMBER));

            // 3. Create a sample Python environment owned by Alice
            Environment pythonEnv = new Environment("Sample Python Project", "Pre-configured environment for demo",
                    alice);
            environmentRepository.save(pythonEnv);

            File mainPy = new File("main.py",
                    "def greet(name):\n    return f\"Hello, {name}! Welcome to CodeColab.\"\n\nprint(greet(\"World\"))",
                    pythonEnv);
            pythonEnv.getFiles().add(mainPy);
            fileRepository.save(mainPy);
            environmentRepository.save(pythonEnv);

            // 4. Create friendships (Alice is friends with Bob, Charlie, Dave)
            friendRequestRepository.save(new FriendRequest(alice, bob, FriendRequestStatus.ACCEPTED));
            friendRequestRepository.save(new FriendRequest(alice, charlie, FriendRequestStatus.ACCEPTED));
            friendRequestRepository.save(new FriendRequest(alice, dave, FriendRequestStatus.ACCEPTED));

            System.out.println(
                    "Data seeding completed successfully! Users: Alice, Bob, Charlie, Dave. Password: password123");
        } else {
            System.out.println("Test users already seeded. Skipping DataSeeder.");
        }

        // Ensure friendships exist even if users were already seeded
        java.util.Optional<User> optAlice = userRepository.findByUsername("Alice");
        if (optAlice.isPresent()) {
            User aliceUser = optAlice.get();
            if (friendRequestRepository.findBySenderAndStatus(aliceUser, FriendRequestStatus.ACCEPTED).isEmpty()) {
                User bobUser = userRepository.findByUsername("Bob").orElse(null);
                User charlieUser = userRepository.findByUsername("Charlie").orElse(null);
                User daveUser = userRepository.findByUsername("Dave").orElse(null);

                if (bobUser != null && charlieUser != null && daveUser != null) {
                    friendRequestRepository.save(new FriendRequest(aliceUser, bobUser, FriendRequestStatus.ACCEPTED));
                    friendRequestRepository
                            .save(new FriendRequest(aliceUser, charlieUser, FriendRequestStatus.ACCEPTED));
                    friendRequestRepository.save(new FriendRequest(aliceUser, daveUser, FriendRequestStatus.ACCEPTED));
                    System.out.println("Added missing friendships for Alice.");
                }
            }
        }
    }
}
