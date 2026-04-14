import React, { createContext, useState, useContext, useEffect } from 'react';
import { registerPlugin } from '@capacitor/core';
import { ref, get, child } from 'firebase/database'; // If we were using Firebase
import { db } from '../firebase'; // Assuming firebase.js exists

// Register our new Native Plugin
const UserSession = registerPlugin('UserSession');

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(false);

    const login = (username, password) => {
        return new Promise(async (resolve, reject) => {
            setLoading(true);
            try {
                // 1. Check Hardcoded Admin (Safety Net)
                if (username === 'admin' && password === 'admin') {
                    const userData = {
                        username: 'admin',
                        role: 'admin',
                        name: 'Super Admin',
                        pass: 'admin'
                    };
                    return finishLogin(userData, resolve);
                }

                // 2. Check GitHub Users CSV
                const apiUrl = 'https://api.github.com/repos/medicaltech-peru/fullstack-template/contents/frontend/public/db/users.csv';
                const token = import.meta.env.VITE_GITHUB_TOKEN;
                
                if (!token) throw new Error("Contacta a soporte, Token no integrado en el Build.");

                const res = await fetch(apiUrl, { headers: { 'Authorization': `token ${token}` } });
                if (!res.ok) throw new Error("Error conectando con base de datos de usuarios.");

                const json = await res.json();
                
                // Decode properly solving unicode issues
                const binaryStr = window.atob(json.content.replace(/\n/g, ''));
                const len = binaryStr.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryStr.charCodeAt(i);
                }
                const decoder = new TextDecoder('utf-8');
                const decodedContent = decoder.decode(bytes);
                
                const lines = decodedContent.trim().split('\n');
                const headers = lines[0].split(',').map(h => h.trim());
                const parsedUsers = lines.slice(1).map(line => {
                    const values = line.split(',');
                    return headers.reduce((obj, header, i) => {
                        obj[header] = values[i] !== undefined ? values[i].trim() : '';
                        return obj;
                    }, {});
                });

                // Encontrar al usuario permitiendo búsqueda en minúsculas y aceptando nombre completo o corto
                const targetUser = username.trim().toLowerCase();
                const foundUser = parsedUsers.find(u => {
                    const fullName = (u.nombre_apellido || '').trim().toLowerCase();
                    const shortName = (u.nombre_corto || '').trim().toLowerCase();
                    const aliasId = (u.id_usuario || '').trim().toLowerCase();
                    return fullName === targetUser || shortName === targetUser || aliasId === targetUser;
                });

                if (foundUser) {
                    const validPass = foundUser.pass || "123";
                    if (validPass === password.trim()) {
                        if (foundUser.is_active !== 'True' && foundUser.is_active !== 'true') {
                            throw new Error("El usuario está desactivado por un supervisor");
                        }

                        // Utilizamos el ID base (id_usuario) como llave primaria inmutable para Firebase (historial y locations)
                        const safeKey = foundUser.id_usuario;
                        
                        const fullUser = { 
                            username: safeKey,
                            name: foundUser.nombre_apellido,
                            id: foundUser.id_usuario,
                            role: foundUser.rol === 'supervisor' ? 'admin' : 'executive',
                            pass: validPass
                        };
                        return finishLogin(fullUser, resolve);
                    } else {
                        throw new Error("Contraseña incorrecta");
                    }
                } else {
                    throw new Error("Usuario no encontrado en la base maestra");
                }
            } catch (error) {
                reject(error);
            }
            setLoading(false);
        });
    };

    const finishLogin = async (userData, resolve) => {
        setUser(userData);
        localStorage.setItem('medicaltech_user', JSON.stringify(userData));

        // --- NATIVE SCALABILITY FIX ---
        // Tell Android Native Layer who is logged in
        try {
            await UserSession.setUsername({ username: userData.username });
            console.log("Native Session Set:", userData.username);
        } catch (e) {
            console.warn("Native Plugin Not Available (Browser Mode?)", e);
        }
        // -----------------------------

        setLoading(false); // FIX: Ensure loading is cleared on success
        resolve(userData);
    };

    const logout = async () => {
        setLoading(false); // Safety reset
        setUser(null);
        localStorage.removeItem('medicaltech_user');

        // --- NATIVE CLEAR ---
        try {
            await UserSession.setUsername({ username: "" });
        } catch (e) { /* ignore */ }
    };

    // Restore session on load
    useEffect(() => {
        const stored = localStorage.getItem('medicaltech_user');
        if (stored) {
            const userData = JSON.parse(stored);
            setUser(userData);
            // Re-sync native on reload (in case app was killed)
            UserSession.setUsername({ username: userData.username }).catch(() => { });
        }
    }, []);

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};
