import {connection} from '../database/connection.js';



export class TeamRepository
{
    static async createTeam(teamId, teamName, teamDescription, teamMembers)
    {
        let members = [];

        for (const user of teamMembers)
        {
            const [row] = await connection.query('SELECT * FROM usuario WHERE nombre = ?', [user]);

            if (row.length > 0) {
                members.push(row[0].id_usuario);
            } else {
                console.warn(`Usuario no encontrado: ${user}`);
                return false;
            }
        }
        
        const [results1] = await connection.query('INSERT INTO equipos (id_equipo, nombre_equipo, nombre_descripcion) VALUES (?, ?, ?)', [teamId, teamName, teamDescription]);

        for(let member of members)
        {
            const [results2] = await connection.query('INSERT INTO usuarios_equipo (id_equipo, id_usuario, id_mensaje) VALUES (?, ?, null)', [teamId, member]);
        }


        return true;
    }
    
    static async getAllTeams(userId)
    {
        const [results] = await connection.query('SELECT e.* FROM equipos e JOIN usuarios_equipo u ON u.id_equipo = e.id_equipo WHERE u.id_usuario = ?', [userId])

        return results;
    }

}

