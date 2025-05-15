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
import { socketHandlers } from './sockets.js';
import cors from "cors";



dotenv.config();
const app = express();

app.use(cors({
  origin: "http://localhost:3000", // o el dominio de tu frontend
  methods: ["GET", "POST"]
}));
const server = createServer(app);
const io = new Server(server, {
    cors: {
    origin: "http://localhost:3000", // importante
    methods: ["GET", "POST"]
  }
});

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


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
    const userNotifications = await UserRepository.getNotification(currentUser[0].id_usuario, 'individuales');
    const numberOfTareas = await UserRepository.getNumberOfTareas(currentUser[0].id_usuario)

    //const teamNotifications = await UserRepository.getNotification(currentUser[0].id_usuario, 'equipo');
    res.render('home', {
        user: currentUser[0],
        friends: userFriends,
        notifications: userNotifications,
        numOfTareas: numberOfTareas[0]?.Tareas
    });
});

app.get('/mensajes', async (req, res) => {
    const userNameCookie = await authorize.getUserFromCookie(req);
    const userName = await UserRepository.getInfo(userNameCookie);
    const userFriends = await UserRepository.getFriends(userNameCookie);
    const teams = await TeamRepository.getAllTeams(userName[0].id_usuario);
    const userNotifications = await UserRepository.getNotification(userName[0].id_usuario);

    let contactName = [];
    let teamWithNotification = [];

    userNotifications.forEach(item => {
        if (!item.room_id.startsWith("room")) {
            teamWithNotification.push(item.room_id);
        } else {
            contactName.push(item.emisor);
        }
    })

    console.log(userName[0].encryption_enabled)

    res.render('mensajes',
        {
            friends: userFriends,
            user: userName[0],
            teams: teams,
            hasNoti: userNotifications.length > 0 ? true : false,
            friendName: contactName,
            teamName: teamWithNotification
        });
});

app.get('/tareas', authorize.onlyAdmin, async (req, res) => {
    const userNameCookie = await authorize.getUserFromCookie(req);
    const userName = await UserRepository.getInfo(userNameCookie);
    const tareas = await UserRepository.getOwnTareas(userName[0].id_usuario);

    res.render('tareas', { tareas: tareas, puntaje: userName[0].puntaje, user: userName[0] });
})


io.on('connect', async (socket) => {
    socketHandlers(io, socket)
});


app.get('/teams', async (req, res) => {
    const userNameCookie = await authorize.getUserFromCookie(req);
    const userName = await UserRepository.getInfo(userNameCookie);

    const teams = await TeamRepository.getAllTeams(userName[0].id_usuario);


    res.render('teams', { equipos: teams, user: userName[0] });
});

app.get('/teams/:id', async (req, res) => {
    const teamId = req.params.id;
    const teamTareas = await TeamRepository.getTeamTareas(teamId)

    res.render('tareas-team', {
        tareas: teamTareas,
        teamId: teamId
    })
})


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

app.post('/tareas', async (req, res) => {
    console.log(req.body);
    const userNameCookie = await authorize.getUserFromCookie(req);
    const userName = await UserRepository.getInfo(userNameCookie);

    const { title, description, dueDate, priority, tipo, id } = req.body;

    if(tipo == 'team') {
        try {
            const result = await UserRepository.createTarea(title, description, dueDate, priority, null, id)
    
            res.send({ status: 'ok', message: 'Tarea creada con exito', redirect: `/teams/${id}`})
        } catch (error) {
            res.send({ status: 'error', message: error })
        }
    } else {
        try {
            const result = await UserRepository.createTarea(title, description, dueDate, priority, userName[0].id_usuario)
    
            res.send({ status: 'ok', message: 'Tarea creada con exito', redirect: '/tareas' })
        } catch (error) {
            res.send({ status: 'error', message: error })
        }
    }

})

app.delete('/tareas', async (req, res) => {

    try {
        const { taskId } = req.body;
        await UserRepository.deleteTarea(taskId);

        res.send({ status: 'ok', message: 'Se ha eliminado correctamente la tarea', redirect: '/tareas' })
    } catch (error) {
        res.send({ status: 'error', message: error })
    }

})

app.patch(`/tareas/:id`, async (req, res) => {
    const taskId = req.params.id;
    const { status } = req.body;

    if (status) {
        try {
            await UserRepository.checkedTarea(taskId, 1);

            res.send({ status: 'ok', completed: true, redirect: '/tareas' })
        } catch (error) {
            res.send({ status: 'error' })
        }
    } else {
        try {
            await UserRepository.checkedTarea(taskId, 0);

            res.send({ status: 'ok', completed: false, redirect: '/tareas' })
        } catch (error) {
            res.send({ status: 'error' })
        }
    }





})

// app.post('/settings/encryption', authorize.onlyAdmin, async (req, res) => {
//     const userNameCookie = await authorize.getUserFromCookie(req);
//     const userName = await UserRepository.getInfo(userNameCookie);

//     const { enableEncryption } = req.body;
//     let temp = enableEncryption ? 1 : 0

//     try {
//         await UserRepository.setEncryptionPreference(userName[0].id_usuario, temp);
//         res.send({ status: 'ok', message: 'Preferencia actualizada correctamente' });
//     } catch (error) {
//         res.status(500).send({ status: 'error', message: 'Error al actualizar la preferencia' });
//     }
// });

const port = process.env.PORT ?? 1234;

server.listen(port, () => {
    console.log(`El servido esta corriendo en ${port}`);
})