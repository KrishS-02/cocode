import WebSocket from 'ws';
import axios from 'axios';

const BASE_URL = 'http://localhost:8080';
const WS_URL = 'ws://localhost:8080/ws/signal';

async function run() {
    const username = `User_${Math.floor(Math.random() * 10000)}`;
    const email = `${username}@example.com`;
    const password = 'password123';

    try {
        // 1. Register
        console.log(`Registering ${username}...`);
        try {
            await axios.post(`${BASE_URL}/api/auth/register`, {
                username,
                email,
                password
            });
        } catch (e) {
            console.log("Registration skipped (might exist or failed):", e.response?.data || e.message);
        }

        // 2. Login
        console.log("Logging in...");
        const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
            username,
            password
        });
        const { token, id } = loginRes.data;
        const userId = id;
        console.log("Logged in:", userId);

        // 3. Create Environment
        console.log("Creating/Getting Environment...");
        let envId;
        try {
            const envsRes = await axios.get(`${BASE_URL}/api/environments/my`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (envsRes.data.length > 0) {
                envId = envsRes.data[0].id;
            } else {
                const newEnv = await axios.post(`${BASE_URL}/api/environments`, {
                    name: "NodeTestEnv",
                    description: "Testing"
                }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                envId = newEnv.data.id;
            }
        } catch (e) {
            console.error("Env error:", e.message);
            return;
        }
        console.log("Env ID:", envId);

        // 4. Connect WS
        console.log("Connecting WS...");
        const ws = new WebSocket(`${WS_URL}/${envId}?token=${token}`);

        ws.on('open', () => {
            console.log("WS Open");

            // 5. Send Chat
            const msg = {
                type: 'CHAT',
                content: 'Hello Node WebRTC',
                senderName: username
            };
            ws.send(JSON.stringify(msg));
            console.log("Sent CHAT");
        });

        ws.on('message', (data) => {
            const str = data.toString();
            console.log("Received:", str);

            const json = JSON.parse(str);
            if (json.type === 'CHAT' && json.content === 'Hello Node WebRTC') {
                console.log("SUCCESS: Verified Chat Message");
                ws.close();
                process.exit(0);
            }
        });

        ws.on('error', (e) => {
            console.error("WS Error:", e.message);
            process.exit(1);
        });

    } catch (e) {
        console.error("Error:", e.response?.data || e.message);
        process.exit(1);
    }
}

run();
