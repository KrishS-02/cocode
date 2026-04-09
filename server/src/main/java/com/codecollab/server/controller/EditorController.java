package com.codecollab.server.controller;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.stereotype.Controller;
import com.codecollab.server.model.CodeUpdate;

@Controller
public class EditorController {

    @MessageMapping("/code")
    @SendTo("/topic/code")
    public CodeUpdate updateCode(CodeUpdate message) throws Exception {
        // In a real app, we might persist this or validate logic
        return message;
    }
}
