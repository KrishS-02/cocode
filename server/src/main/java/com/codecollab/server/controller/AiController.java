package com.codecollab.server.controller;

import com.codecollab.server.dto.AiRequest;
import com.codecollab.server.dto.AiResponse;
import com.codecollab.server.service.AiService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;

@CrossOrigin(origins = "*", maxAge = 3600)
//@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final AiService aiService;

    @Autowired
    public AiController(AiService aiService) {
        this.aiService = aiService;
    }

    @PostMapping("/ask")
    public ResponseEntity<?> askQuestion(@Valid @RequestBody AiRequest request) {
        try {
            String responseText = aiService.askQuestion(request.getQuery(), request.getCodeContext());
            return ResponseEntity.ok(new AiResponse(responseText));
        } catch (Exception e) {
            // Log and return informative error to the frontend
            System.err.println("[AiController] Error calling AI API: " + e.getMessage());
            if (e.getCause() != null) {
                System.err.println("[AiController] Caused by: " + e.getCause().getMessage());
            }
            
            String errorMsg = e.getMessage();
            if (errorMsg != null && errorMsg.contains("401")) {
                errorMsg = "Invalid AI API Key (401 Unauthorized). Please check your GROQ_API_KEY setting in the Render dashboard.";
            }
            
            return ResponseEntity.internalServerError()
                    .body("AI service error: " + errorMsg);
        }
    }
}
