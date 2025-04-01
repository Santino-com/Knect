import jsonwebtoken from 'jsonwebtoken'; 
import dotenv from'dotenv';
import { UserRepository } from '../model/user-repository.js';


dotenv.config();

async function onlyAdmin(req, res, next) 
{
    const isLoggedIn = await checkCookie(req);
    if(!isLoggedIn)
    {
        return res.redirect('/login');
    } 

    return next();
}

async function onlyPublic(req, res, next) 
{
    const isLoggedIn = await checkCookie(req);
    if(isLoggedIn)
    {
        return res.redirect('/home');
    } 

    return next();
}

async function checkCookie(req) 
{
    try {
        const cookieHeader = req.headers.cookie;
        if (!cookieHeader) {
            return false;
        }

        const jwtCookie = cookieHeader.split('; ').find(row => row.startsWith('jwt='));
        if (!jwtCookie) {
            return false;
        }

        const token = jwtCookie.slice(4);

        const decoded = jsonwebtoken.verify(token, process.env.JWT_SECRET);
        const userName = decoded.userName;

        const verify = await UserRepository.getUsers(userName);
        
        return verify;
        
    } catch (error) {
        console.error('Error verificando la cookie:', error.message);
        return false;
    }
}


async function getUserFromCookie(req){
    const cookieHeader = req.headers.cookie;
        if (!cookieHeader) {
            return false;
        }

        const jwtCookie = cookieHeader.split('; ').find(row => row.startsWith('jwt='));
        if (!jwtCookie) {
            return false;
        }

        const token = jwtCookie.slice(4);

        const decoded = jsonwebtoken.verify(token, process.env.JWT_SECRET);
        const userName = decoded.userName;

        return userName;
}


export const methods = {
    onlyAdmin, 
    onlyPublic,
    getUserFromCookie
}