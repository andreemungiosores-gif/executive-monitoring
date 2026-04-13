import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import VisitList from './VisitList';
import { registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';

// Capacitor Plugins
const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');
const BatteryOptimization = registerPlugin('BatteryOptimization'); // Add this

import { ref, update } from 'firebase/database';
import { db } from '../../firebase';

const ExecutiveHome = () => {
    const { logout, user } = useAuth();
    const navigate = useNavigate();

    // Tracking State (Persisted in localStorage across navigation)
    const [isTracking, setIsTracking] = useState(() => localStorage.getItem('isTracking') === 'true');
    const [watchId, setWatchId] = useState(() => localStorage.getItem('watchId') || null);
    const [statusMsg, setStatusMsg] = useState('');

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            // Optional cleanup
        };
    }, []);

    const handleCheckIn = async () => {
        try {
            setStatusMsg("Iniciando GPS...");

            // 0. Request Battery Optimization Exemptions (CRITICAL)
            try {
                await BatteryOptimization.requestIgnoreBatteryOptimizations();
                console.log("Battery Optimizations Requested");
            } catch (e) {
                console.warn("Battery Opt Plugin failed (Browser?)", e);
            }

            // 1. Add Watcher
            const id = await BackgroundGeolocation.addWatcher(
                {
                    backgroundMessage: "Compartiendo ubicación en tiempo real",
                    backgroundTitle: "Modo Ejecutivo Activo",
                    requestPermissions: true,
                    stale: false,
                    distanceFilter: 0 // Changed from 10 to 0 for sensitive testing
                },
                (location, error) => {
                    if (error) {
                        console.error("Watcher Error:", error);
                        setStatusMsg("Error GPS: " + error.message);
                        return;
                    }
                    if (location) {
                        // Native HTTP Interceptor in MainActivity handles the upload.
                        console.log("Loc Update:", location);
                    }
                }
            );

            setWatchId(id);
            localStorage.setItem('watchId', id);

            setIsTracking(true);
            localStorage.setItem('isTracking', 'true');
            setStatusMsg("Rastreo Activo");

        } catch (error) {
            alert("Error al iniciar rastreo: " + error.message);
            setStatusMsg("Error");
        }
    };

    const handleCheckOut = async () => {
        if (watchId) {
            await BackgroundGeolocation.removeWatcher({ id: watchId });
            setWatchId(null);
            localStorage.removeItem('watchId');
        }

        // WAIT 2.5s for Native Thread to finish any last "Active" POST
        // This prevents the Java layer from overwriting our "Offline" status
        await new Promise(resolve => setTimeout(resolve, 2500));

        // --- 2. TELL SERVER WE ARE OFFLINE ---
        if (user && user.username) {
            try {
                await update(ref(db, `locations/${user.username}`), {
                    status: 'offline',
                    active: false,
                    timestamp: Date.now()
                });
            } catch (e) {
                console.error("Error setting offline status:", e);
            }
        }

        setIsTracking(false);
        localStorage.removeItem('isTracking');
        setStatusMsg("Jornada Finalizada");
    };

    const handleLogout = async () => {
        if (isTracking) {
            await handleCheckOut(); // Ensure we mark offline BEFORE clearing auth
        }
        logout();
        navigate('/');
    };

    return (
        <div className="bg-gray-50 min-h-screen pb-20">
            {/* Header */}
            <header className="bg-white p-6 shadow-sm sticky top-0 z-10">
                <div className="flex justify-between items-center mb-1">
                    <h1 className="text-2xl font-bold text-gray-800">Hola, {user?.name?.split(' ')[0]}</h1>
                    <div className={`w-3 h-3 rounded-full ${isTracking ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
                </div>
                <p className="text-gray-500 text-sm">{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            </header>

            {/* Main Action Card */}
            <div className="p-6">
                {!isTracking ? (
                    <button
                        onClick={handleCheckIn}
                        className="w-full bg-white rounded-3xl shadow-lg border-2 border-red-100 p-8 flex flex-col items-center justify-center gap-4 hover:shadow-xl transition-all active:scale-95 group"
                    >
                        <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center text-white shadow-red-200 shadow-xl group-hover:scale-110 transition-transform">
                            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <div className="text-center">
                            <h2 className="text-xl font-bold text-gray-800">MARCAR ENTRADA</h2>
                            <p className="text-sm text-gray-400">Iniciar jornada laboral</p>
                        </div>
                    </button>
                ) : (
                    <div className="w-full bg-red-600 rounded-3xl shadow-lg shadow-red-200 p-8 text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-20">
                            <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
                        </div>

                        <div className="relative z-10">
                            <h2 className="text-3xl font-bold mb-1">EN JORNADA</h2>
                            <p className="text-red-100 font-medium mb-6 flex items-center gap-2">
                                <span className="animate-pulse">●</span> {statusMsg || "Rastreo GPS Activo"}
                            </p>

                            <button
                                onClick={handleCheckOut}
                                className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white px-6 py-3 rounded-xl font-bold text-sm transition-colors border border-white/30 flex items-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                MARCAR SALIDA
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Assignments Section */}
            <div className="px-6">
                <VisitList />
            </div>

            {/* Logout Footer */}
            <div className="p-6 mt-4">
                <button onClick={handleLogout} className="w-full text-center text-gray-400 text-sm font-medium hover:text-red-500 transition-colors">
                    Cerrar Sesión
                </button>
            </div>
        </div>
    );
};

export default ExecutiveHome;
