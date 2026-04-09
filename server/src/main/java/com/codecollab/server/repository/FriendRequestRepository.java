package com.codecollab.server.repository;

import com.codecollab.server.model.FriendRequest;
import com.codecollab.server.model.FriendRequestStatus;
import com.codecollab.server.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface FriendRequestRepository extends JpaRepository<FriendRequest, UUID> {
    List<FriendRequest> findByReceiverAndStatus(User receiver, FriendRequestStatus status);

    Optional<FriendRequest> findBySenderAndReceiver(User sender, User receiver);

    List<FriendRequest> findBySenderAndStatus(User sender, FriendRequestStatus status);
}
