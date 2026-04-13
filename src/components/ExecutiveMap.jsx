import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { db } from '../firebase';
import { ref, set } from 'firebase/database';
import { registerPlugin, CapacitorHttp } from '@capacitor/core';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');
// v3.0: Standard Native HTTP used instead of custom plugin

// Simple Loader Component
const SimpleLoader = () => (
    <div className="flex flex-col items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
        <p className="font-medium animate-pulse text-white">Acquiring GPS Signal...</p>
    </div>
);

const ExecutiveMap = () => {
    const [currentPosition, setCurrentPosition] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const [isSharing, setIsSharing] = useState(false);
    const [watchId, setWatchId] = useState(null);
    const [logs, setLogs] = useState([]); // Debug logs
    const mapRef = useRef(null);
    const navigate = useNavigate();

    const EXECUTIVE_ID = 'executive_1';

    const addLog = (msg) => {
        setLogs(prev => [`${new Date().toLocaleTimeString()}: ${msg}`, ...prev]);
        console.log(msg);
    };

    useEffect(() => {
        const setupListener = async () => {
            await App.addListener('appStateChange', ({ isActive }) => {
                if (isActive) {
                    addLog('App resumed.');
                }
            });
        };
        setupListener();

        return () => {
            App.removeAllListeners();
            if (watchId) {
                BackgroundGeolocation.removeWatcher({ id: watchId });
            }
        };
    }, []);

    const updateFirebase = async (lat, lng, heading, speed) => {
        const payload = {
            latitude: lat,
            longitude: lng,
            heading: heading || 0,
            speed: speed || 0,
            timestamp: Date.now(),
            status: 'active'
        };

        try {
            // v4.2 OPTIMIZATION:
            // Native Interceptor (MainActivity.java) handles transmission 100% of the time.
            // We DISABLE JS transmission here to prevent "Burst" freezes when resuming app.
            // The UI will still update locally for the user.

            // const response = await CapacitorHttp.request(options);
            addLog(`UI Upd (Native Transmitting...)`);

        } catch (e) {
            addLog(`UI Update Error: ${e.message}`);
        }
    };

    const startSharing = async () => {
        if (isSharing) {
            addLog('Already sharing.');
            return;
        }

        try {
            addLog('Starting watcher (v3.0 Native HTTP)...');
            setErrorMessage(null);

            // AUTO WAKELOCK is handled by BackgroundGeolocation service and manual permissions.

            const id = await BackgroundGeolocation.addWatcher(
                {
                    backgroundMessage: "Sharing location...",
                    backgroundTitle: "Tracking Active",
                    requestPermissions: true,
                    stale: false,
                    distanceFilter: 0
                },
                (location, error) => {
                    if (error) {
                        const msg = error.message || "Unknown watcher error";
                        setErrorMessage(msg);
                        addLog(msg);
                        return;
                    }

                    if (location) {
                        if (!isSharing) setIsSharing(true);
                        const { latitude, longitude, bearing, speed } = location;

                        // 1. UI Update
                        setCurrentPosition([latitude, longitude]);
                        if (mapRef.current) {
                            mapRef.current.flyTo([latitude, longitude], 15);
                        }

                        // 2. Native Network Send
                        updateFirebase(latitude, longitude, bearing, speed);
                    }
                }
            );

            setWatchId(id);
            setIsSharing(true);
            addLog(`Watcher started. ID: ${id}`);

        } catch (error) {
            addLog(`START FAIL: ${error.message}`);
            setErrorMessage(error.message);
            setIsSharing(false);
        }
    };

    const handleLogout = async () => {
        addLog('Logging out...');
        if (watchId !== null) {
            try {
                await BackgroundGeolocation.removeWatcher({ id: watchId });
            } catch (e) {
                addLog(`Cleanup error: ${e.message}`);
            }
            setWatchId(null);
        }

        try {
            const options = {
                url: `https://ubicacionandree-default-rtdb.firebaseio.com/locations/${EXECUTIVE_ID}.json`,
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                data: null
            };
            await CapacitorHttp.request(options);
        } catch (e) {
            console.error("Logout cleanup failed:", e);
        }

        setIsSharing(false);
        navigate('/');
    };

    return (
        <div className="h-screen w-full flex flex-col relative">
            {/* Header Overlay */}
            <div className="absolute top-0 left-0 right-0 z-[1000] p-4 bg-gradient-to-b from-black/80 to-transparent text-white">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-bold">Executive Mode</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`w-3 h-3 rounded-full ${isSharing ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                            <span className="text-sm opacity-90">{isSharing ? 'Online' : 'Offline'}</span>
                        </div>
                        {errorMessage && <p className="text-red-400 text-xs mt-1">{errorMessage}</p>}
                    </div>
                    {/* Retry Button */}
                    <div className="flex gap-2">
                        {!isSharing && (
                            <button
                                onClick={startSharing}
                                className="bg-blue-600 px-3 py-1 rounded text-xs font-bold shadow hover:bg-blue-500"
                            >
                                START
                            </button>
                        )}
                        <button
                            onClick={() => updateFirebase(-12.0, -77.0, 0, 0)} // Fake coordinates near Lima
                            className="bg-purple-600 px-3 py-1 rounded text-xs font-bold shadow hover:bg-purple-500"
                        >
                            TEST NET
                        </button>
                    </div>
                </div>
            </div>

            {/* Map */}
            <MapContainer
                center={[-12.0464, -77.0428]}
                zoom={13}
                style={{ height: "100%", width: "100%" }}
                ref={mapRef}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {currentPosition && (
                    <Marker position={currentPosition}>
                        <Popup>
                            You are here
                        </Popup>
                    </Marker>
                )}
            </MapContainer>

            {/* PERSISTENT DEBUG LOGS v3.0 */}
            <div className="absolute bottom-24 left-4 right-4 z-[900] bg-black/80 p-2 rounded max-h-40 overflow-y-auto text-xs text-green-400 font-mono">
                <p className="text-white border-b border-gray-600 mb-1">Status Logs:</p>
                {logs.map((log, i) => (
                    <div key={i}>{log}</div>
                ))}
            </div>

            {/* Loading Overlay */}
            {isSharing && !currentPosition && !errorMessage && (
                <div className="absolute inset-0 z-[900] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
                    <SimpleLoader />
                    <p className="text-gray-300 text-xs mt-4">Waiting for movement...</p>
                </div>
            )}

            {/* LOG OUT BUTTON */}
            <button
                onClick={handleLogout}
                className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[1000] bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-full shadow-lg font-bold border-2 border-white/20 transition-all active:scale-95"
            >
                LOG OUT
            </button>
        </div>
    );
};

export default ExecutiveMap;
