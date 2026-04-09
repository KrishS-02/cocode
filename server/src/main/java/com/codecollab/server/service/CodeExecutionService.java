package com.codecollab.server.service;

import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileWriter;
import java.io.InputStreamReader;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
public class CodeExecutionService {

    public String executePython(String code) {
        File tempFile = null;
        try {
            // 1. Write code to a temporary file
            tempFile = File.createTempFile("code_", ".py");
            try (FileWriter writer = new FileWriter(tempFile)) {
                writer.write(code);
            }

            // 2. Build the process
            // Detect OS to determine python command
            String pythonCmd = "python"; 
            if (!System.getProperty("os.name").toLowerCase().contains("win")) {
                pythonCmd = "python3"; // Use python3 on Linux/Mac (like the Docker image)
            }

            ProcessBuilder pb = new ProcessBuilder(pythonCmd, tempFile.getAbsolutePath());
            pb.redirectErrorStream(true); // Merge stderr into stdout

            // 3. Start and wait with timeout
            Process process = pb.start();
            boolean finished = process.waitFor(5, TimeUnit.SECONDS);

            if (!finished) {
                process.destroy();
                return "Error: Execution timed out (limit: 5 seconds).";
            }

            // 4. Capture output
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                return reader.lines().collect(Collectors.joining("\n"));
            }

        } catch (Exception e) {
            return "Error: " + e.getMessage();
        } finally {
            // 5. Cleanup
            if (tempFile != null && tempFile.exists()) {
                tempFile.delete();
            }
        }
    }
}
