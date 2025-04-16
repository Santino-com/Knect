import mysql from 'mysql2/promise';

export const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    database: 'knect',
    port: 3306,
    password: 'vivelavi'
});