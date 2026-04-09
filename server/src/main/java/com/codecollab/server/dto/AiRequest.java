package com.codecollab.server.dto;

import jakarta.validation.constraints.NotBlank;

public class AiRequest {
    @NotBlank(message = "Query cannot be empty")
    private String query;
    private String codeContext;

    public String getQuery() {
        return query;
    }

    public void setQuery(String query) {
        this.query = query;
    }

    public String getCodeContext() {
        return codeContext;
    }

    public void setCodeContext(String codeContext) {
        this.codeContext = codeContext;
    }
}
