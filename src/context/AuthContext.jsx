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

                // 2. Check Firebase for Executives
                const dbRef = ref(db);
                // We use cleanUsername logic matching UserManagement creation
                const cleanUsername = username.trim().replace(/[.#$\[\]]/g, "");

                const snapshot = await get(child(dbRef, `users/${cleanUsername}`));

                if (snapshot.exists()) {
                    const userData = snapshot.val();
                    // Check password (In prod, use Hashing. MVP: Plaintext match)
                    if (userData.pass === password) {
                        const fullUser = { ...userData, username: cleanUsername };
                        return finishLogin(fullUser, resolve);
                    } else {
                        throw new Error("Contraseña incorrecta");
                    }
                } else {
                    throw new Error("Usuario no encontrado");
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
