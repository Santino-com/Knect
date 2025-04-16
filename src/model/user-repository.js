import { connection } from '../database/connection.js';
import bcrypt from 'bcrypt';
import { SALT_ROUNDS } from '../../config.js';

export class UserRepository {
    static async create({ user, correo, birth, password }) {
        console.log(user);
        // Validar que los campos requeridos existen
        if (!user || !correo || !password) {
            throw new Error('Los campos son obligatorios.');
        }

        // Verificar si el usuario o correo ya existen
        const [results] = await connection.query(
            'SELECT nombre, correo FROM usuarios WHERE nombre = ? OR correo = ?',
            [user, correo]
        );

        if (results.length > 0) {
            // Determinar cuál campo está duplicado para dar un mensaje más específico
            if (results[0].nombre === user) {
                throw new Error('El nombre de usuario ya está en uso');
            } else if (results[0].correo === correo) {
                throw new Error('El correo electrónico ya está registrado');
            } else {
                throw new Error('El usuario o correo ya están registrados');
            }
        }

        // Encriptar la contraseña
        const hashPassword = bcrypt.hashSync(password, SALT_ROUNDS);

        // Insertar el nuevo usuario
        const [insertResult] = await connection.query(
            'INSERT INTO usuarios (nombre, contra, fecha_nacimiento, correo) VALUES(?, ?, ?, ?)',
            [user, hashPassword, birth, correo]
        );

        // Crear entrada en la tabla de intentos fallidos (si es necesario)
        try {
            await connection.query(
                'UPDATE usuarios SET intentos_fallidos = 0, bloqueo_hasta = NULL WHERE id_usuario = ?',
                [insertResult.insertId]
            );
        } catch (error) {
            console.warn('No se pudo inicializar los intentos fallidos:', error);
            // No interrumpir el registro si esta parte falla
        }

        return insertResult.insertId;
    }

    static async login({ user, password }) {
        // Obtener usuario por nombre
        const [results] = await connection.query(
            'SELECT id_usuario, nombre, contra, bloqueo_hasta FROM usuarios WHERE nombre = ?',
            [user]
        );

        if (results.length === 0) {
            throw new Error('Usuario no encontrado');
        }

        const usuario = results[0];
        
        // Verificar si la cuenta está bloqueada
        if (usuario.bloqueo_hasta && new Date(usuario.bloqueo_hasta) > new Date()) {
            throw new Error('Cuenta bloqueada temporalmente. Intenta más tarde.');
        }

        // Verificar contraseña
        const isValid = await bcrypt.compare(password, usuario.contra);
        if (!isValid) {
            // Incrementar intentos fallidos
            await this.incrementarIntentos(usuario.id_usuario);
            throw new Error('Contraseña incorrecta');
        }

        // Restablecer intentos fallidos en caso de éxito
        await this.reiniciarIntentos(usuario.id_usuario);

        return usuario.nombre;
    }

    static async getUsers(userName) {
        const [results] = await connection.query('SELECT nombre FROM usuarios WHERE nombre= ?', [userName]);
        if (results.length === 0)
            return false;

        return true;
    }

    static async getLastMessage() {
        const [results] = await connection.query('SELECT id_mensaje, fecha_envio FROM mensajes ORDER BY fecha_envio DESC LIMIT 1');

        if (results.length === 0) return -1;

        return results;
    }

    static async insertMessage(id_emisor, msg, roomId) {
        const [results] = await connection.query(
            ` INSERT INTO mensajes 
            (id_emisor, contenido, room_id) 
            VALUES (?, ?, ?)`,
            [id_emisor, msg, roomId]
        );
        if (results.affectedRows === 0) return false;

        return true;
    }

    static async insertMultimedia(userId, multimedia, roomId) {
        const [add] = await connection.query(
            ` INSERT INTO mensajes 
            (id_emisor, multimedia, room_id) 
            VALUES (?, ?, ?)`,
            [userId, multimedia, roomId]
        );
        if (add.affectedRows === 0) throw new Error('Ha occurido un error');

    }

    static async getInfo(username) {
        const [results] = await connection.query('SELECT * FROM usuarios WHERE nombre = ?', [username]);

        return results;
    }

    static async getFriends(username) {
        const [results] = await connection.query(
            `SELECT DISTINCT u.nombre, u.id_usuario 
            FROM usuarios u  
            JOIN Amistad a ON (u.id_usuario = a.id_usuario1 OR u.id_usuario = a.id_usuario2)
            WHERE 
            u.nombre != ? 
            AND a.estado = "aceptada"`,
            [username]
        );

        return results;
    }

    static async getMessages(roomId) {
        const [results] = await connection.query(
            `SELECT m.contenido, m.multimedia, m.fecha_envio, u.nombre 
            FROM mensajes m
            JOIN usuarios u ON m.id_emisor = u.id_usuario
            WHERE m.room_id = ?
            ORDER BY m.fecha_envio`,
            [roomId]
        );

        return results;
    }

    // Método para verificar si una cuenta está bloqueada
    static async verificarBloqueo(userId) {
        try {
            const [results] = await connection.query(
                'SELECT bloqueo_hasta FROM usuarios WHERE id_usuario = ?',
                [userId]
            );
            
            if (results.length === 0) return false;
            
            const bloqueoHasta = results[0].bloqueo_hasta;
            if (bloqueoHasta && new Date(bloqueoHasta) > new Date()) {
                return true; // La cuenta está bloqueada
            }
            return false; // La cuenta no está bloqueada
        } catch (error) {
            console.error('Error al verificar bloqueo:', error);
            return false;
        }
    }
    
    // Método para incrementar intentos fallidos
    static async incrementarIntentos(userId) {
        try {
            const [results] = await connection.query(
                'SELECT intentos_fallidos FROM usuarios WHERE id_usuario = ?',
                [userId]
            );
            
            const intentosFallidos = results[0]?.intentos_fallidos || 0;
            
            if (intentosFallidos >= 3) {
                // Bloquear la cuenta por 1 hora
                const bloqueoHasta = new Date();
                bloqueoHasta.setHours(bloqueoHasta.getHours() + 1);
                
                await connection.query(
                    'UPDATE usuarios SET intentos_fallidos = 0, bloqueo_hasta = ? WHERE id_usuario = ?',
                    [bloqueoHasta, userId]
                );
            } else {
                await connection.query(
                    'UPDATE usuarios SET intentos_fallidos = ? WHERE id_usuario = ?',
                    [intentosFallidos + 1, userId]
                );
            }
        } catch (error) {
            console.error('Error al incrementar intentos fallidos:', error);
        }
    }
    
    // Método para reiniciar intentos fallidos
    static async reiniciarIntentos(userId) {
        try {
            await connection.query(
                'UPDATE usuarios SET intentos_fallidos = 0, bloqueo_hasta = NULL WHERE id_usuario = ?',
                [userId]
            );
        } catch (error) {
            console.error('Error al reiniciar intentos fallidos:', error);
        }
    }
}


class ValidateData {
    static ValidateUser(user) {
        if (typeof user !== 'string') throw new Error('El usuario debe ser un string');
        if (user.length < 3) throw new Error('El usuario debe ser mayor a tres caracteres');
    }

    static ValidatePassword(password) {
        if (typeof password !== 'string') throw new Error('La contraseña debe ser un string');
        if (password.length < 6) throw new Error('La contraseña debe ser mayor a 6 caracteres');
    }
}