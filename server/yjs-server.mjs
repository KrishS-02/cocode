import { Server } from "@hocuspocus/server";

const server = new Server({
    port: 1234,
});

server.listen().then(() => {
    console.log("Hocuspocus Yjs Server running on ws://localhost:1234");
});
