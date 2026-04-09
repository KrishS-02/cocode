package com.codecollab.server.service;

import com.codecollab.server.model.AuditLog;
import com.codecollab.server.repository.AuditLogRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class AuditService {

    private final AuditLogRepository auditLogRepository;

    @Autowired
    public AuditService(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    @Transactional
    public void logAction(UUID actorId, String action, String targetId, String details) {
        AuditLog log = new AuditLog(actorId, action, targetId, details);
        auditLogRepository.save(log);
    }

    public List<AuditLog> getEnvironmentLogs(String environmentId) {
        return auditLogRepository.findByTargetIdOrderByTimestampDesc(environmentId);
    }
}
