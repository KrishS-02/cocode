import { Server } from "@hocuspocus/server";

const PORT = parseInt(process.env.PORT || '1234', 10);

const server = new Server({
    port: PORT,
});

server.listen().then(() => {
    console.log(`Hocuspocus Yjs Server running on ws://localhost:${PORT}`);
});
