package com.codecollab.server.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AiService {

    @Value("${spring.ai.openai.api-key}")
    private String apiKey;

    @Value("${spring.ai.openai.chat.options.model:gemini-2.0-flash}")
    private String model;

    @Value("${spring.ai.openai.base-url:https://generativelanguage.googleapis.com/v1beta/openai}")
    private String baseUrl;

    private final RestTemplate restTemplate = new RestTemplate();

    public String askQuestion(String query, String codeContext) {
        String systemPrompt = "You are an expert Python coding assistant helping a user inside CoCode, a collaborative coding platform. Be concise and helpful.";

        String context = (codeContext != null && !codeContext.isBlank())
                ? codeContext
                : "No code highlighted.";

        String userMessage = "Code context:\n```\n" + context + "\n```\n\nQuestion: " + query;

        // Use mutable structures so Jackson can serialize them
        List<Map<String, String>> messages = new ArrayList<>();

        Map<String, String> systemMsg = new HashMap<>();
        systemMsg.put("role", "system");
        systemMsg.put("content", systemPrompt);
        messages.add(systemMsg);

        Map<String, String> userMsg = new HashMap<>();
        userMsg.put("role", "user");
        userMsg.put("content", userMessage);
        messages.add(userMsg);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", model);
        requestBody.put("messages", messages);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Authorization", "Bearer " + apiKey);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
        String endpoint = baseUrl + "/chat/completions";

        System.out.println("[AiService] Calling AI API endpoint: " + endpoint);
        System.out.println("[AiService] Model: " + model);

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> response = restTemplate.postForObject(endpoint, entity, Map.class);

            if (response == null) {
                System.err.println("[AiService] Received null response from AI API");
                return "No response from AI.";
            }

            System.out.println("[AiService] Response received, keys: " + response.keySet());

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> choices = (List<Map<String, Object>>) response.get("choices");
            if (choices == null || choices.isEmpty()) {
                return "Empty response from AI.";
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
            return (String) message.getOrDefault("content", "No content in AI response.");

        } catch (HttpClientErrorException e) {
            System.err.println(
                    "[AiService] AI API client error (" + model + ") " + e.getStatusCode() + ": " + e.getResponseBodyAsString());
            throw new RuntimeException("AI API error " + e.getStatusCode() + ": " + e.getResponseBodyAsString(), e);
        } catch (Exception e) {
            System.err.println("[AiService] Unexpected error calling AI API: " + e.getMessage());
            throw new RuntimeException("AI call failed: " + e.getMessage(), e);
        }
    }
}
