package com.codecollab.server.repository;

import com.codecollab.server.model.ChatMessage;
import com.codecollab.server.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ChatMessageRepository extends JpaRepository<ChatMessage, UUID> {
    List<ChatMessage> findBySenderAndReceiverOrReceiverAndSenderOrderByTimestampAsc(
            User sender1, User receiver1, User receiver2, User sender2);

    List<ChatMessage> findByGroupIdOrderByTimestampAsc(UUID groupId);
}
