const { Server } = require("socket.io");
const clients = new Map();

class SocketManager {
    constructor() {
        this.io = null;
    }

    initialize(server) {
        this.io = new Server(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"],
                credentials: true
            }
        });

        this.io.on('connection', (socket) => {
            console.log('connection method called--->>>');

            socket.on('register', (data) => {
                const clientId = data?.clientId ?? '';
                clients.set(clientId, socket);
                socket.clientId = clientId;
                socket.emit('on_register','success');
                console.log('Client connected with ID', clientId);
            });

            socket.on('disconnectClient', (clientId) => {
                console.log('disconnected ')
                clients.delete(clientId);
                console.log('Client disconnected', clientId);
            });

            socket.on('message', (message) => {
                console.log('Message received:', message);
                this.io.emit('message', message);
            });
        });
        console.log('Socket.IO initialized');
    }

    emitEvent(eventName, data, clientId) {
        console.log('socket file emitevent function called-->>>>');
        if (this.io) {
            const socket = clients.get(clientId);
            if (socket) {
                socket.emit(eventName, data);
                return { success: true, message: `Event ${eventName} emitted to client ${clientId}` };
            } else {
                const errorMsg = `No client found with ID ${clientId}`;
                console.error(errorMsg);
                return { success: false, message: errorMsg };
            }
        } else {
            const errorMsg = 'Socket.IO not initialized';
            console.error(errorMsg);
            return { success: false, message: errorMsg };
        }
    }
    
}

module.exports = new SocketManager();
