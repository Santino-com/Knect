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

    static async getNumberOfTareas(userId) {
        const [result] = await connection.query(`SELECT id_usuario, count(id_usuario) AS Tareas
                                                FROM Tareas
                                                WHERE id_usuario = ?
                                                AND cheked = 0
                                                GROUP BY id_usuario;
                                                `, [userId])

        return result
    }

    static async setNotification(userId, msgId) {

        if (typeof (userId) == 'number') {
            try {
                const [result] = await connection.query(`
                    INSERT INTO notificaciones (id_usuario, id_mensaje)
                    VALUES (?, ?)
                `, [userId, msgId]);
                return result;
            } catch (error) {
                console.error('Error al incrementar notificaciones:', error);
                return null;
            }
        } else if (typeof (userId) == 'string') {
            ////////Es un mensaje de un equipo
            try {
                const [result] = await connection.query(`
                    INSERT INTO notificaciones (id_team, id_mensaje)
                    VALUES (?, ?)
                `, [userId, msgId]);
                return result;
            } catch (error) {
                console.error('Error al incrementar notificaciones:', error);
                return null;
            }
        }
    }

    static async deleteNotification(id, tipo) {
        if (tipo == 'individual') {
            const [rows] = await connection.query(`
                DELETE FROM notificaciones WHERE id_usuario = ?
            `, [id]);

            return rows
        } else if (tipo == 'equipo') {
            const [rows] = await connection.query(`
                DELETE FROM notificaciones WHERE id_team = ?
            `, [id]);
            return rows
        }


    }

    static async getNotification(id) {

        const [results] = await connection.query(`
            SELECT * FROM vista_notificaciones_mensajes WHERE id_usuario = ?
        `, [id]);

        return results;
    }

    static async getTeamMessages(teamId) {
        const [results] = await connection.query(
            `SELECT m.contenido, m.multimedia, m.fecha_envio, u.nombre 
            FROM mensajes m
            JOIN usuario u ON m.id_emisor = u.id_usuario
            WHERE m.room_id = ?
            ORDER BY m.fecha_envio`,
            [teamId]
        );

        return results;
    }

    static async getTeamMembers(teamId) {
        const [results] = await connection.query(
            "SELECT ue.id_equipo, ue.id_usuario, u.nombre FROM usuarios_equipo ue JOIN usuario u ON u.id_usuario = ue.id_usuario WHERE ue.id_equipo = ?",
            [teamId]
        );

        return results;
    }

    static async createTarea(title, description, dueDate, priority, userId = null, teamId = null) {
        try {
            const [newTarea] = await connection.query(`INSERT INTO Tareas (titulo, descripcion, fecha_limite, prioridad, id_usuario, id_equipo) 
                                                    VALUES (?, ?, ?, ?, ?, ?)`, [title, description, dueDate, priority, userId, teamId])

            if (newTarea.affectedRows == 0) throw new Error('Ha ocurrido un error a la hora de crear la tarea')

            return newTarea
        } catch (error) {
            throw new Error('Ha ocurrido un error con la base de datos')
        }
    }

    static async getOwnTareas(userId) {
        const [results] = await connection.query("SELECT * FROM Tareas WHERE id_usuario = ?", [userId])
        return results;
    }

    static async deleteTarea(taskId) {
        const [result] = await connection.query("DELETE FROM Tareas WHERE id_tarea = ?", [taskId])

        if (result.affectedRows == 0) throw new Error('Ha ocurrido un error en la base de datos');
    }

    static async checkedTarea(taskId, status) {
        const [result] = await connection.query("UPDATE Tareas SET cheked = ? WHERE id_tarea = ?", [status, taskId])

        if (result.affectedRows == 0) throw new Error('Ha ocurrido un error en la base de datos');
    }

    static async getEncryptionPreference(userId) {
        const [result] = await connection.query(
            'SELECT encryption_enabled FROM usuario WHERE id_usuario = ?',
            [userId]
        );
        return result[0]?.encryption_enabled ?? 0;
    }

    static async setEncryptionPreference(userId, enabled) {
        await connection.query(
            'UPDATE usuario SET encryption_enabled = ? WHERE id_usuario = ?',
            [enabled, userId]
        );
    }

}

