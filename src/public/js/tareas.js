const body = document.querySelector('body');
const userId = body.dataset.userId;
const userName = body.dataset.userName;

let socket;

function initializeSocket() {
    socket = io({
        auth: {
            serverOffset: 0,
            userName: userName,
            userId: userId,
            page: 'tareas'
        }
    });

    socket.on('connect', () => {
        console.log(`Usuario ${userId} conectado desde home`);
    });
}


initializeSocket();