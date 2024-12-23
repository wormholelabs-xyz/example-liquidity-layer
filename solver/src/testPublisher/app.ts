import * as zmq from "zeromq";

main();

async function main() {
    const sock = new zmq.Publisher();
    //sock.bind("ipc:///tmp/fast-transfer-usdc");
    sock.bind("tcp://localhost:3000");

    // set timeout every 1 second and publish a message
    setInterval(async () => {
        sock.send([Uint8Array.from([3]), "message"]);
        console.log("published");
    }, 1000);
}
