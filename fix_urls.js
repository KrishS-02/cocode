const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'client', 'src');

function processFile(filePath) {
    if (filePath.endsWith('config.ts')) return;

    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;

    // Step 1: Inside backtick template literals, just replace the literal hostname part
    // e.g. `http://localhost:8080/api/x/${y}` → `${API_BASE_URL}/api/x/${y}`
    content = content.replace(/`http:\/\/localhost:8080/g, '`${API_BASE_URL}');
    content = content.replace(/`ws:\/\/localhost:8080/g, '`${WS_BASE_URL}');

    // Step 2: Single-quoted full URL strings → backtick template literals
    // e.g. 'http://localhost:8080/api/path' → `${API_BASE_URL}/api/path`
    // Match ONLY complete single-quoted URL strings (no newlines, no other single quotes inside)
    content = content.replace(/'http:\/\/localhost:8080([^'\n]*)'/g, '`${API_BASE_URL}$1`');
    content = content.replace(/'ws:\/\/localhost:8080([^'\n]*)'/g, '`${WS_BASE_URL}$1`');

    // Step 3: Double-quoted versions (just in case)
    content = content.replace(/"http:\/\/localhost:8080([^"\n]*)"/g, '`${API_BASE_URL}$1`');
    content = content.replace(/"ws:\/\/localhost:8080([^"\n]*)"/g, '`${WS_BASE_URL}$1`');

    if (content === original) return; // no changes needed

    // Step 4: Fix up imports
    const usesApiBase = content.includes('API_BASE_URL');
    const usesWsBase = content.includes('WS_BASE_URL');

    // Remove any existing config import (might be wrong)
    content = content.replace(/import \{ API_BASE_URL(?:, WS_BASE_URL)? \} from '\.\.\/config';\n?/g, '');
    content = content.replace(/import \{ API_BASE_URL(?:, WS_BASE_URL)? \} from '\.\/config';\n?/g, '');

    if (usesApiBase || usesWsBase) {
        let importLine;
        if (usesApiBase && usesWsBase) {
            importLine = "import { API_BASE_URL, WS_BASE_URL } from '../config';";
        } else if (usesWsBase) {
            importLine = "import { WS_BASE_URL } from '../config';";
        } else {
            importLine = "import { API_BASE_URL } from '../config';";
        }

        // Fix import path for pages/ directory
        if (filePath.includes(`${path.sep}pages${path.sep}`)) {
            importLine = importLine.replace("'../config'", "'../config'");
        }
        if (filePath.includes(`${path.sep}context${path.sep}`)) {
            importLine = importLine.replace("'../config'", "'../config'");
        }

        // Insert after the first import line
        content = content.replace(/^(import .+\n)/, `$1${importLine}\n`);
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated:', path.basename(filePath));
}

function walk(dir) {
    fs.readdirSync(dir).forEach(file => {
        const full = path.join(dir, file);
        if (fs.statSync(full).isDirectory()) {
            walk(full);
        } else if (full.endsWith('.tsx') || full.endsWith('.ts')) {
            processFile(full);
        }
    });
}

walk(srcDir);
console.log('Done!');
