import express from 'express';
import {dirname, join} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { UserRepository } from './model/user-repository.js';
import jsonwebtoken from 'jsonwebtoken'; 
import dotenv from'dotenv';
import {methods as authorize} from './middlewares/authorization.js';
import cookieParser from 'cookie-parser';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import {connection} from './database/connection.js';
import { TeamRepository } from './model/team-repository.js';
import { nanoid } from 'nanoid';

dotenv.config();
const app = express();
const server = createServer(app);
const io = new Server(server, {
    connectionStateRecovery: {}
});

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({extended: false}));


const __dirname = dirname(fileURLToPath(import.meta.url));
app.set('views', join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static(join(__dirname, 'public')));


app.get('/login',authorize.onlyPublic, (req, res)=>{
    res.render('index');
});
app.get('/register', authorize.onlyPublic, (req, res)=>{
    res.render('register');
})
app.get('/home', authorize.onlyAdmin, async (req, res)=>{
    const userNameCookie = await authorize.getUserFromCookie(req);

    const currentUser = await UserRepository.getInfo(userNameCookie);
    const userFriends = await UserRepository.getFriends(userNameCookie);
    
    res.render('home', {user: currentUser[0].nombre, friends: userFriends});
});

app.get('/mensajes', async (req, res)=>{
    const userNameCookie = await authorize.getUserFromCookie(req);
    const userName = await UserRepository.getInfo(userNameCookie);
    const userFriends = await UserRepository.getFriends(userNameCookie);
    const teams = await TeamRepository.getAllTeams(userName[0].id_usuario);

    res.render('mensajes', {friends: userFriends, user: userName, teams: teams});
});

io.on('connection', async (socket)=>{
    console.log('Usuario conectado');


    socket.on('disconnect', () => {
        console.log('Usuario desconectado');
    });

    socket.on('start-chat', async (contactId, currentUserId)=>{
        console.log('Iniciando chat');

        function generateRoomId(user1Id, user2Id) {
            const sortedIds = [user1Id, user2Id].sort((a, b) => a - b);
            return `room_${sortedIds[0]}_${sortedIds[1]}`;
        }

        const roomId = generateRoomId(contactId, currentUserId);

        console.log(roomId);
        socket.join(roomId);
        const previusMessages = await UserRepository.getMessages(roomId);

        socket.emit('chat-started', previusMessages, roomId);

    });

    socket.on('chat message', async (msg, room) => {

        const userName = socket.handshake.auth.userName;
        console.log(userName);
        const currentUser = await UserRepository.getInfo(userName);

        const saveMensaje = await UserRepository.insertMessage(currentUser[0].id_usuario, msg, room);
        if (!saveMensaje) throw new Error('Error al guardar el mensaje');

        const lastMessage = await UserRepository.getLastMessage();

        // Emitir el mensaje a todos los clientes conectados
        io.to(room).emit('chat message', msg, lastMessage[0].id_mensaje, 
            lastMessage[0].fecha_envio.toLocaleString('es-ES', { 
            year: 'numeric', 
            month: 'long',    
            day: 'numeric',   
            hour: 'numeric',   
            minute: 'numeric' 
        }), userName);
    });

  

    if (!socket.recovered) {
        try {
            const [results] = await connection.query(`
                SELECT m.id_mensaje, m.contenido, m.fecha_envio, m.room_id, u.nombre AS emisor
                FROM mensajes m
                JOIN usuario u ON m.id_emisor = u.id_usuario
                WHERE m.id_mensaje > ? AND m.room_id = ?`,
                [socket.handshake.auth.serverOffset ?? 0, socket.handshake.auth.roomId ?? 0]
            );

            results.forEach(row => {
                socket.to(row.room_id).emit('chat message', row.contenido, row.id_mensaje, 
                    row.fecha_envio.toLocaleString('es-ES', { 
                    year: 'numeric',  
                    month: 'long',     
                    day: 'numeric',    
                    hour: 'numeric',   
                    minute: 'numeric' 
                }), row.emisor, row.room_id);
            });

        } catch (error) {
            console.log('Error: ' + error);
        }
    }
});

app.get('/teams', async (req, res)=>{
    const userNameCookie = await authorize.getUserFromCookie(req);
    const userName = await UserRepository.getInfo(userNameCookie);

    const teams = await TeamRepository.getAllTeams(userName[0].id_usuario);


    res.render('teams', {equipos: teams});
});


app.post('/login', async (req, res)=>{
    const {user, password} = req.body;
        
    try {
        const userName = await UserRepository.login({user, password});
        const token = jsonwebtoken.sign({userName}, process.env.JWT_SECRET, {expiresIn: '1h'});
        const cookieOptions={
            maxAge:process.env.JWT_COOKIE_EXPIRES_IN *60*60*1000,
            path: '/'
        };

        res.cookie('jwt', token, cookieOptions);
        res.send({ status: 'ok', message: 'Inicio de sesión exitoso', redirect: '/home' });
        //res.send({status: 'ok', message: 'Usuario logueado', redirect: '/home'});
        //res.redirect('/home');
    } catch (error) {
        res.status(401).send({error: 'Usuario o contraseña incorrecta'});
    }
});

app.post('/register', async (req, res)=>{
    const {user, correo, birth, password} = req.body;

    if (!user || !correo || !password) {
        return res.status(400).json({ status: "Error", message: "Los campos son obligatorios." });
    }

    try {
        const idUser = await UserRepository.create({user, correo, birth, password});
        res.redirect('/login');
    } catch (error) {
        res.status(400).send(error);
    }
});

app.post('/teams', async (req, res)=>{
    const teamId = nanoid(10);

    const {teamName, teamDescription, teamMembers} = req.body;
    const userNameCookie = await authorize.getUserFromCookie(req);
    const userName = await UserRepository.getInfo(userNameCookie);

    teamMembers.push(userName[0].nombre);

    console.log({teamName, teamDescription, teamMembers});

    try {
        const team = await TeamRepository.createTeam(teamId, teamName, teamDescription, teamMembers);

        if(!team)
            res.send({ status: 'error', message: '\tOcurrio un error a la hora de crear el equipo.\n\tAsegurate de escribir bien el nombre de los integrantes', redirect: '/teams' });

        res.send({ status: 'ok', message: 'Equipo creado', redirect: '/teams' });
    } catch (error) {
        console.log('Error: ' + error);
    }

})


const port = process.env.PORT ?? 1234;

server.listen(port, ()=>{
    console.log(`El servido esta corriendo en ${port}`);
})