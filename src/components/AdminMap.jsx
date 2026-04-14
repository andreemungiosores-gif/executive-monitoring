import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { ref, onValue, get, child, set } from 'firebase/database';
import { db } from '../firebase';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const TRAIL_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

// Function to calculate distance between two lat/lng coordinates in km
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; 
}

const LEGACY_KEYS = {
    'Angel': '66100f9d52a1f57bfdcc0aac',
    'Mauro': '6976935a047835d421e9cd0b'
};
const mapLegacyKey = (key) => LEGACY_KEYS[key] || key;

const AdminMap = () => {
    // --- STATE ---
    const [locations, setLocations] = useState({});
    const [trails, setTrails] = useState({});
    const [selectedDate, setSelectedDate] = useState(() => {
        // Use local date (Peru/System time) to match Android's behavior
        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
    });
    const [selectedUser, setSelectedUser] = useState(null);
    const [pdvs, setPdvs] = useState({});
    const [assignments, setAssignments] = useState([]);
    
    // --- REFS ---
    const trailsRef = useRef({});
    const mapRef = useRef(null);

    // --- EFFECTS ---

    // 0. Load PDVs (Points of Sale) - Master Data
    useEffect(() => {
        get(ref(db, 'pdvs')).then(snapshot => {
            if (snapshot.exists()) {
                setPdvs(snapshot.val());
            }
        }).catch(err => console.error("Error loading PDVs", err));
    }, []);

    // 1. Data Loader (History + Realtime if Today)
    useEffect(() => {
        // Compute "Today" in local time to match selectedDate
        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        const todayStr = new Date(d.getTime() - offset).toISOString().split('T')[0];

        const isToday = selectedDate === todayStr;

        // Function to load immutable history
        const loadHistory = async () => {
            setTrails({}); // Clear map while loading
            console.log("Loading history for:", selectedDate);
            trailsRef.current = {};

            try {
                const snapshot = await get(child(ref(db), `routes/${selectedDate}`));
                if (snapshot.exists()) {
                    const historyData = snapshot.val();
                    const hydratedTrails = {};

                    Object.entries(historyData).forEach(([username, pushPoints]) => {
                        const finalKey = mapLegacyKey(username);
                        const points = [];
                        // Sort by timestamp if available to evaluate sequentially
                        const sortedPt = Object.values(pushPoints).sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));
                        
                        let lastValid = null;
                        sortedPt.forEach(pt => {
                            if (pt.latitude && pt.longitude) {
                                if (!lastValid) {
                                    points.push([pt.latitude, pt.longitude]);
                                    lastValid = pt;
                                } else {
                                    const dist = getDistance(lastValid.latitude, lastValid.longitude, pt.latitude, pt.longitude);
                                    // Calculate elapsed minutes
                                    const timeDiffMins = Math.abs((pt.timestamp || 0) - (lastValid.timestamp || 0)) / 60000;
                                    
                                    // Reject GPS spikes: > 1.5km within 3 mins, OR anything completely drastic (> 5km chunk)
                                    const isSpike = (timeDiffMins < 3 && dist > 1.5) || dist > 5;
                                    
                                    if (!isSpike) {
                                        points.push([pt.latitude, pt.longitude]);
                                        lastValid = pt;
                                    }
                                }
                            }
                        });
                        
                        if (hydratedTrails[finalKey]) {
                            hydratedTrails[finalKey] = [...hydratedTrails[finalKey], ...points];
                        } else {
                            hydratedTrails[finalKey] = points;
                        }
                    });

                    console.log("Hydrated Trails:", hydratedTrails);
                    setTrails(hydratedTrails);
                    trailsRef.current = hydratedTrails;
                } else {
                    console.log("No tracks found for this date.");
                    setTrails({});
                }
            } catch (e) {
                console.error("Error loading route history:", e);
            }
        };

        loadHistory();

        // Only Start Realtime Listener if viewing TODAY
        if (isToday) {
            const locationsRef = ref(db, 'locations');
            const unsubscribe = onValue(locationsRef, (snapshot) => {
                const data = snapshot.val();
                const now = Date.now();
                const activeExecs = {};
                const nextTrails = { ...trailsRef.current };
                const foundUserKeys = new Set();

                if (data) {
                    Object.entries(data).forEach(([key, val]) => {
                        const finalKey = mapLegacyKey(key);
                        // Filters...
                        if (val.status === 'offline') return;
                        if (val.timestamp && (now - val.timestamp > 10 * 60 * 1000)) return;

                        activeExecs[finalKey] = val;
                        foundUserKeys.add(finalKey);

                        const lat = val.latitude || val.lat;
                        const lng = val.longitude || val.lng;

                        if (lat && lng) {
                            const newPoint = [lat, lng];
                            const userTrail = nextTrails[finalKey] || [];
                            const lastPoint = userTrail.length > 0 ? userTrail[userTrail.length - 1] : null;

                            // Check movement > 5m to avoid noise
                            if (!lastPoint || (Math.abs(lastPoint[0] - lat) > 0.00005 || Math.abs(lastPoint[1] - lng) > 0.00005)) {
                                let skip = false;
                                if (lastPoint) {
                                    const dist = getDistance(lastPoint[0], lastPoint[1], lat, lng);
                                    if (dist > 1.5) skip = true; // Block abrupt >1.5km live jump
                                }

                                if (!skip) {
                                    const updatedTrail = [...userTrail, newPoint];
                                    // We rely on Firebase History for persistence, but keep RAM buffer reasonable
                                    if (updatedTrail.length > 5000) updatedTrail.shift();
                                    nextTrails[finalKey] = updatedTrail;
                                }
                            }
                        }
                    });
                }

                // Keep markers updated
                setLocations(activeExecs);

                // Update trails but keep history even if offline
                trailsRef.current = nextTrails;
                setTrails(nextTrails);
            });

            return () => unsubscribe();
        } else {
            // Viewing History: Clear "Live" markers
            setLocations({});
        }

    }, [selectedDate]);

    // 2. Fetch Assignments for Selected User/Date
    useEffect(() => {
        if (!selectedUser) {
            setAssignments([]);
            return;
        }

        const assignRef = ref(db, `assignments/${selectedDate}/${selectedUser}`);
        const unsubscribe = onValue(assignRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                setAssignments(Object.values(data));
            } else {
                setAssignments([]);
            }
        });

        return () => unsubscribe();
    }, [selectedUser, selectedDate]);


    // 3. Auto-center map when user selected (ONCE only)
    const lastCenteredUser = useRef(null);

    useEffect(() => {
        if (selectedUser && mapRef.current) {
            // Only center if this is a NEW user selection
            if (lastCenteredUser.current === selectedUser) return;

            const loc = locations[selectedUser];
            let target = null;

            // 1. Try Live Location
            if (loc) {
                const lat = loc.latitude || loc.lat;
                const lng = loc.longitude || loc.lng;
                if (lat && lng) target = [lat, lng];
            }
            // 2. Try Last Trail Point (if offline but has history)
            else if (trails[selectedUser] && trails[selectedUser].length > 0) {
                target = trails[selectedUser][trails[selectedUser].length - 1];
            }

            if (target) {
                mapRef.current.flyTo(target, 15);
                lastCenteredUser.current = selectedUser; // Mark as centered
            }
        } else {
            // Reset if no user selected
            lastCenteredUser.current = null;
        }
    }, [selectedUser, locations, trails]);

    // --- LOGIC ---

    // Calculate Visits based on Proximity (Verification)
    // Returns the assignments list but with 'verified_visit' boolean
    const getProcessedAssignments = () => {
        const userTrail = trails[selectedUser] || [];

        return assignments.map(task => {
            // Use existing 'verified' status if we persist it, or calculate purely on trails
            // For now, let's assume 'verified' might be stored, or we calculate it.
            // If status is 'visited', we trust it.
            if (task.status === 'visited') return { ...task, verified: true };

            // Proximity Check (Naive: if any trail point is within ~50m)
            // 0.0005 degrees is roughly 55 meters at equator
            if (userTrail.length > 0) {
                const isVisited = userTrail.some(point => {
                    const dist = Math.sqrt(Math.pow(point[0] - task.latitude, 2) + Math.pow(point[1] - task.longitude, 2));
                    return dist < 0.0005;
                });
                if (isVisited) return { ...task, verified: true };
            }

            return { ...task, verified: false };
        });
    };

    const processedList = getProcessedAssignments();
    const stats = {
        total: processedList.length,
        visited: processedList.filter(t => t.verified).length,
        pending: processedList.filter(t => !t.verified).length
    };

    const handleBackToList = () => {
        setSelectedUser(null);
    };



    // --- HELPERS ---
    // Merge users from DB, live locations, and trails to ensure everyone is listed
    const [allGithubUsers, setAllGithubUsers] = useState([]);

    useEffect(() => {
        const loadGithubUsers = async () => {
            try {
                const token = import.meta.env.VITE_GITHUB_TOKEN;
                const url = 'https://api.github.com/repos/medicaltech-peru/fullstack-template/contents/frontend/public/db/users.csv';
                if (!token) return;
                
                const res = await fetch(url, { headers: { 'Authorization': `token ${token}` } });
                if (!res.ok) return;
                
                const json = await res.json();
                const decoded = decodeURIComponent(escape(window.atob(json.content.replace(/\n/g, ''))));
                
                const lines = decoded.trim().split('\n');
                const headers = lines[0].split(',').map(h => h.trim());
                
                const parsedUsers = lines.slice(1).map(line => {
                    const values = line.split(',');
                    return headers.reduce((obj, header, i) => {
                        obj[header] = values[i] !== undefined ? values[i].trim() : '';
                        return obj;
                    }, {});
                });

                const activeSellers = parsedUsers.filter(u => u.is_active === 'True' || u.is_active === 'true');
                
                const vendorList = activeSellers.map(u => {
                    const realName = u.nombre_apellido;
                    const shortName = u.nombre_corto || u.nombre_apellido; // Fallback to full name
                    const safeKey = u.id_usuario;
                    return { id: safeKey, name: realName, shortName: shortName };
                });

                // Dedup based on id
                const dedupedMap = new Map();
                vendorList.forEach(v => dedupedMap.set(v.id, v));
                setAllGithubUsers(Array.from(dedupedMap.values()));
            } catch (e) {
                console.error("Error loading users:", e);
            }
        };
        loadGithubUsers();
    }, []);

    // We build a map of id -> name to merge with active realtime/trail locations
    const allUsersMergeMap = new Map();
    const shortNamesMap = new Map();
    allGithubUsers.forEach(u => {
        allUsersMergeMap.set(u.id, u.name);
        shortNamesMap.set(u.id, u.shortName);
    });
    
    Object.keys(locations).forEach(k => { 
        if (!allUsersMergeMap.has(k)) allUsersMergeMap.set(k, k); 
        if (!shortNamesMap.has(k)) shortNamesMap.set(k, k); 
    });
    Object.keys(trails).forEach(k => { 
        if (!allUsersMergeMap.has(k)) allUsersMergeMap.set(k, k); 
        if (!shortNamesMap.has(k)) shortNamesMap.set(k, k); 
    });

    const allUsers = Array.from(allUsersMergeMap.entries()).map(([id, name]) => ({ id, name })).sort((a,b) => a.name.localeCompare(b.name));

    const defaultCenter = [-12.0464, -77.0428];
    const googleCenter = React.useMemo(() => ({ lat: defaultCenter[0], lng: defaultCenter[1] }), []);

    return (
        <div className="flex h-full w-full bg-gray-50">
            {/* LEFT PANEL: Executive List / Details */}
            <div className="w-1/3 h-full p-4 flex flex-col z-10 shadow-xl bg-white border-r relative">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Ejecutivos</h2>

                {!selectedUser ? (
                    /* LIST VIEW */
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                        {allUsers.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-2 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                <p>No hay ejecutivos activos.</p>
                            </div>
                        )}
                        {allUsers.map((userObj) => {
                            const username = userObj.id;
                            const displayName = userObj.name;
                            const isOnline = !!locations[username];

                            return (
                                <div
                                    key={username}
                                    onClick={() => setSelectedUser(username)}
                                    className="flex items-center p-4 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md cursor-pointer transition-all hover:bg-gray-50 group"
                                >
                                    {/* Avatar Placeholder */}
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg mr-4 ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`}>
                                        {displayName.charAt(0).toUpperCase()}
                                    </div>

                                    <div className="flex-1">
                                        <h3 className="font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">
                                            {displayName}
                                        </h3>
                                        <div className="flex items-center mt-1">
                                            <span className={`w-2 h-2 rounded-full mr-2 ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
                                            <span className="text-xs text-gray-500 font-medium">
                                                {isOnline ? 'En línea' : 'Desconectado'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="text-gray-300 group-hover:text-gray-600">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* DETAILS VIEW (Mock for now) */
                    <div className="flex-1 flex flex-col animate-fadeIn">
                        <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-4">
                            <div>
                                <h3 className="font-bold text-lg text-gray-800">Rutas Asignadas</h3>
                                <p className="text-sm text-gray-500">Ejecutivo: <span className="text-blue-600 font-semibold">{
                                    allUsersMergeMap.get(selectedUser) || selectedUser
                                }</span></p>
                            </div>
                            <button
                                onClick={handleBackToList}
                                className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="bg-red-50 p-3 rounded-lg flex items-center justify-between mb-6 border border-red-100">
                            <span className="text-xs font-bold text-red-800 uppercase tracking-widest">Fecha Seleccionada:</span>
                            <span className="text-sm font-bold text-red-900 bg-white px-2 py-1 rounded shadow-sm">{selectedDate}</span>
                        </div>

                        {/* KPIS */}
                        <div className="grid grid-cols-3 gap-3 mb-6">
                            <div className="bg-blue-50 p-3 rounded-xl text-center border border-blue-100">
                                <div className="text-2xl font-black text-blue-600">{stats.total}</div>
                                <div className="text-[10px] uppercase font-bold text-blue-400 tracking-wide mt-1">Total</div>
                            </div>
                            <div className="bg-green-50 p-3 rounded-xl text-center border border-green-100">
                                <div className="text-2xl font-black text-green-600">{stats.visited}</div>
                                <div className="text-[10px] uppercase font-bold text-green-400 tracking-wide mt-1">Visitados</div>
                            </div>
                            <div className="bg-orange-50 p-3 rounded-xl text-center border border-orange-100">
                                <div className="text-2xl font-black text-orange-600">{stats.pending}</div>
                                <div className="text-[10px] uppercase font-bold text-orange-400 tracking-wide mt-1">Pendientes</div>
                            </div>
                        </div>

                        {/* ASSIGNMENTS LIST */}
                        <div className="flex-1 overflow-y-auto space-y-2 mb-4 pr-1 custom-scrollbar">
                            {processedList.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-40 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 p-4 text-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    <p className="text-xs font-medium">No hay rutas asignadas.</p>
                                </div>
                            ) : (
                                processedList.map((task, i) => (
                                    <div key={i} className={`p-3 rounded-lg border flex items-center justify-between ${task.verified ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'}`}>
                                        <div className="flex-1 min-w-0 mr-2">
                                            <p className={`text-sm font-bold truncate ${task.verified ? 'text-green-800' : 'text-gray-800'}`}>{task.name}</p>
                                            <p className="text-xs text-gray-500 truncate">{task.address || task.distrito || task.speciality}</p>
                                        </div>
                                        <div>
                                            {task.verified ? (
                                                <span className="bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-sm">VISITADO</span>
                                            ) : (
                                                <span className="bg-orange-100 text-orange-600 text-[10px] font-bold px-2 py-1 rounded-full border border-orange-200">PENDIENTE</span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <button
                            onClick={handleBackToList}
                            className="w-full py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg shadow-red-200 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1-11a1 1 0 112 0 1 1 0 01-2 0zm.707 9.293a1 1 0 001.414 0l4-4a1 1 0 00-1.414-1.414L11 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2z" clipRule="evenodd" />
                            </svg>
                            Volver al Mapa Completo
                        </button>
                    </div>
                )}
            </div>

            {/* RIGHT PANEL: Map */}
            <div className="w-2/3 h-full relative">
                {/* Date Picker Overlay */}
                <div className="absolute top-4 right-4 z-[1000] bg-white p-3 rounded-xl shadow-2xl border border-gray-200">
                    <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Fecha de Recorrido</label>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 w-40"
                    />
                </div>

                <MapContainer
                    ref={mapRef}
                    center={defaultCenter}
                    zoom={12}
                    style={{ height: '100%', width: '100%' }}
                >
                    {/* USING GOOGLE MAPS TILESERVER FOR PURE LEAFLET MAP */}
                    <TileLayer
                        attribution="&copy; Google Maps"
                        url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                    />

                    {/* Render Trails */}
                    {Object.entries(trails).map(([key, positions], index) => {
                        // Focus Effect: Dim other trails if user selected
                        const isSelected = selectedUser === key;
                        const isDimmed = selectedUser && !isSelected;

                        return (
                            <Polyline
                                key={`trail-${key}`}
                                positions={positions}
                                pathOptions={{
                                    color: TRAIL_COLORS[index % TRAIL_COLORS.length],
                                    weight: isSelected ? 6 : 4,
                                    opacity: isDimmed ? 0.2 : 0.8,
                                    lineCap: 'round',
                                    lineJoin: 'round'
                                }}
                            >
                                <Popup>Recorrido: {shortNamesMap.get(key) || key}</Popup>
                            </Polyline>
                        );
                    })}

                    {/* Render Markers - Live Agents */}
                    {Object.entries(locations).map(([key, data]) => {
                        if (selectedUser && selectedUser !== key) return null;

                        const lat = data.latitude || data.lat;
                        const lng = data.longitude || data.lng;

                        if (lat && lng) {
                            return (
                                <Marker key={key} position={[lat, lng]}>
                                    <Popup>
                                        <strong>{data.name}</strong><br />
                                        Last updated: {new Date(data.timestamp).toLocaleTimeString()}
                                    </Popup>
                                </Marker>
                            );
                        }
                        return null;
                    })}

                    {/* Render Markers - Assigned PDVs */}
                    {selectedUser && processedList.map((task, i) => (
                        <Marker
                            key={`task-${i}`}
                            position={[task.latitude, task.longitude]}
                            opacity={task.verified ? 1 : 0.6}
                        >
                            <Popup>
                                <strong>{task.name}</strong><br />
                                <span className={task.verified ? "text-green-600 font-bold" : "text-orange-500 font-bold"}>
                                    {task.verified ? "✅ VISITADO" : "⏳ PENDIENTE"}
                                </span>
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>
        </div>
    );
};

export default AdminMap;
