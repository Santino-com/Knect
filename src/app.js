import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { UserRepository } from './model/user-repository.js';
import jsonwebtoken from 'jsonwebtoken';
import dotenv from 'dotenv';
import { methods as authorize } from './middlewares/authorization.js';
import cookieParser from 'cookie-parser';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { connection } from './database/connection.js';
import { TeamRepository } from './model/team-repository.js';
import { nanoid } from 'nanoid';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import fs from 'fs'
import {socketHandlers} from './sockets.js';



dotenv.config();
const app = express();
const server = createServer(app);
const io = new Server(server, {
    connectionStateRecovery: {}
});

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));


cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET 
});

const upload = multer({ dest: 'uploads/' });

const __dirname = dirname(fileURLToPath(import.meta.url));
app.set('views', join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static(join(__dirname, 'public')));


app.get('/login', authorize.onlyPublic, (req, res) => {
    res.render('index');
});
app.get('/register', authorize.onlyPublic, (req, res) => {
    res.render('register');
})
app.get('/home', authorize.onlyAdmin, async (req, res) => {
    const userNameCookie = await authorize.getUserFromCookie(req);

    const currentUser = await UserRepository.getInfo(userNameCookie);
    const userFriends = await UserRepository.getFriends(userNameCookie);

    res.render('home', { user: currentUser[0].nombre, friends: userFriends });
});

app.get('/mensajes', async (req, res) => {
    const userNameCookie = await authorize.getUserFromCookie(req);
    const userName = await UserRepository.getInfo(userNameCookie);
    const userFriends = await UserRepository.getFriends(userNameCookie);
    const teams = await TeamRepository.getAllTeams(userName[0].id_usuario);


    res.render('mensajes', { friends: userFriends, user: userName, teams: teams });
});


io.on('connect', async (socket) => {
    socketHandlers(io, socket)
});


app.get('/teams', async (req, res) => {
    const userNameCookie = await authorize.getUserFromCookie(req);
    const userName = await UserRepository.getInfo(userNameCookie);

    const teams = await TeamRepository.getAllTeams(userName[0].id_usuario);


    res.render('teams', { equipos: teams });
});


app.post('/login', async (req, res) => {
    const { user, password } = req.body;

    try {
        const userName = await UserRepository.login({ user, password });
        const token = jsonwebtoken.sign({ userName }, process.env.JWT_SECRET, { expiresIn: '1h' });
        const cookieOptions = {
            maxAge: process.env.JWT_COOKIE_EXPIRES_IN * 60 * 60 * 1000,
            path: '/'
        };

        res.cookie('jwt', token, cookieOptions);
        res.send({ status: 'ok', message: 'Inicio de sesión exitoso', redirect: '/home' });
        //res.send({status: 'ok', message: 'Usuario logueado', redirect: '/home'});
        //res.redirect('/home');
    } catch (error) {
        res.status(401).send({ error: 'Usuario o contraseña incorrecta' });
    }
});

app.post('/register', async (req, res) => {
    const { user, correo, birth, password } = req.body;

    if (!user || !correo || !password) {
        return res.status(400).json({ status: "Error", message: "Los campos son obligatorios." });
    }

    try {
        const idUser = await UserRepository.create({ user, correo, birth, password });
        res.redirect('/login');
    } catch (error) {
        res.status(400).send(error);
    }
});

app.post('/teams', async (req, res) => {
    const teamId = nanoid(10);

    const { teamName, teamDescription, teamMembers } = req.body;
    const userNameCookie = await authorize.getUserFromCookie(req);
    const userName = await UserRepository.getInfo(userNameCookie);

    teamMembers.push(userName[0].nombre);

    console.log({ teamName, teamDescription, teamMembers });

    try {
        const team = await TeamRepository.createTeam(teamId, teamName, teamDescription, teamMembers);

        if (!team)
            res.send({ status: 'error', message: '\tOcurrio un error a la hora de crear el equipo.\n\tAsegurate de escribir bien el nombre de los integrantes', redirect: '/teams' });

        res.send({ status: 'ok', message: 'Equipo creado', redirect: '/teams' });
    } catch (error) {
        console.log('Error: ' + error);
    }

});

app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const filePath = req.file.path;
        const userId = req.body.userId;
        const roomId = req.body.roomId;

        console.log('Archivo recibido:', filePath);
        console.log('ID del usuario:', userId);
        console.log('ID del room:', roomId);


        const result = await cloudinary.uploader.upload(filePath, {
            resource_type: 'auto',
        });

        await UserRepository.insertMultimedia(userId, result.secure_url, roomId);
        const [results] = await connection.query(`
            SELECT m.fecha_envio AS fecha, m.room_id, u.nombre AS emisor
            FROM mensajes m
            JOIN usuario u ON m.id_emisor = u.id_usuario
            WHERE m.room_id = ?`,
            [roomId]
        );

        fs.unlinkSync(filePath);

        

        

        io.emit('fileMessage', {
            url: result.secure_url,
            type: result.resource_type,
            nombre: results[0].emisor,
            fecha: results[0].fecha
        });

        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false });
    }
});


const port = process.env.PORT ?? 1234;

server.listen(port, () => {
    console.log(`El servido esta corriendo en ${port}`);
})