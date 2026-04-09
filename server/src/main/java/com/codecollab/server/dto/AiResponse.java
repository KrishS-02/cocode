package com.codecollab.server.dto;

public class AiResponse {
    private String response;

    public AiResponse(String response) {
        this.response = response;
    }

    public String getResponse() {
        return response;
    }

    public void setResponse(String response) {
        this.response = response;
    }
}
