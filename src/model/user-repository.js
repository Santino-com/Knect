import { connection } from '../database/connection.js';
import bcrypt from 'bcrypt';
import { SALT_ROUNDS } from '../../config.js';



export class UserRepository {
    static async create({ user, correo, birth, password }) {
        console.log(user);
        //Validate.validate(user);
        //Validate.validate(password);

        const [results] = await connection.query(
            'SELECT nombre FROM usuario WHERE nombre = ? OR correo = ?',
            [user, correo]
        );

        if (results.length > 0) throw new Error('El nombre de usuario ya esta en uso');

        const hashPassword = bcrypt.hashSync(password, SALT_ROUNDS);

        const [insertResult] = await connection.query('INSERT INTO usuario (nombre, contra, fecha_nacimiento, correo) VALUES(?, ?, ?, ?)',
            [user, hashPassword, birth, correo]
        );

        return insertResult.insertId;
    }

    static async login({ user, password }) {
        // Validate.validate(username);
        // Validate.validate(password);

        const [results] = await connection.query(
            'SELECT nombre, contra FROM usuario WHERE nombre = ?',
            [user]
        );


        if (results.length === 0) console.log('Usuario no encontrado');

        const isValid = await bcrypt.compare(password, results[0].contra);
        if (!isValid) {
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }

        return results[0].nombre;
    }

    static async getUsers(userName) {
        const [results] = await connection.query('SELECT nombre FROM usuario WHERE nombre= ?', [userName]);
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
        const [results] = await connection.query('SELECT * FROM usuario WHERE nombre = ?', [username]);

        return results;
    }

    static async getFriends(username) {
        const [results] = await connection.query(
            `SELECT DISTINCT u.nombre, u.id_usuario 
            FROM usuario u  
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
            JOIN usuario u ON m.id_emisor = u.id_usuario
            WHERE m.room_id = ?
            ORDER BY m.fecha_envio`,
            [roomId]
        );

        return results;
    }

    static async incrementUnreadMessages(id, roomId) {
        try {
            const [result] = await connection.query(`
                INSERT INTO notificaciones (id_usuario, room_id, mensajes_no_leidos)
                VALUES (?, ?, 1)
                ON DUPLICATE KEY UPDATE mensajes_no_leidos = mensajes_no_leidos + 1
            `, [id, roomId]);
            return result;
        } catch (error) {
            console.error('Error al incrementar notificaciones:', error);
            return null;
        }
    }

    static async getUnreadMessages(id, roomId) {
        try {
            const [rows] = await connection.query(`
                SELECT mensajes_no_leidos FROM notificaciones
                WHERE id_usuario = ? AND room_id = ?
            `, [id, roomId]);

            return rows.length > 0 ? rows.length : 0;
        } catch (error) {
            console.error('Error al obtener notificaciones:', error);
            return 0;
        }
    }

    static async markMessagesAsRead(id, roomId) {
        try {
            const [result] = await connection.query(`
                UPDATE notificaciones
                SET mensajes_no_leidos = 0
                WHERE id_usuario = ? AND room_id = ?
            `, [id, roomId]);
    
            return result;
        } catch (error) {
            console.error('Error al marcar mensajes como leídos:', error);
            return null;
        }
    }

    static async getAllUnreadNotifications(id) {
        try {
            const [rows] = await connection.query(`
                SELECT room_id, mensajes_no_leidos FROM notificaciones
                WHERE id_usuario = ? AND mensajes_no_leidos > 0
            `, [id]);
    
            return rows;
        } catch (error) {
            console.error('Error al obtener todas las notificaciones:', error);
            return [];
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