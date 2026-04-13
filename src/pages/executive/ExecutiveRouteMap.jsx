import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ref, onValue } from 'firebase/database';
import { db } from '../../firebase';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet icons issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom User Icon
const userIconHtml = `
  <div style="background-color: white; border: 2px solid #ef4444; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
    <svg style="width: 24px; height: 24px; color: #ef4444;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
  </div>
`;

const userIcon = L.divIcon({
    html: userIconHtml,
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
});

// Custom PDV Icon
const pdvIconHtml = `
  <div style="position: relative; width: 30px; height: 40px;">
    <svg viewBox="0 0 24 24" fill="#ef4444" stroke="#ffffff" stroke-width="2">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  </div>
`;

const pdvIcon = L.divIcon({
    html: pdvIconHtml,
    className: '',
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -40]
});

// Green PDV Icon for completed
const pdvCompletedIconHtml = `
  <div style="position: relative; width: 30px; height: 40px;">
    <svg viewBox="0 0 24 24" fill="#10B981" stroke="#ffffff" stroke-width="2">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  </div>
`;

const pdvCompletedIcon = L.divIcon({
    html: pdvCompletedIconHtml,
    className: '',
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -40]
});

const ExecutiveRouteMap = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [visits, setVisits] = useState([]);
    const [myLocation, setMyLocation] = useState(null);

    useEffect(() => {
        if (!user || !user.username) return;

        // Fetch user location
        const locRef = ref(db, `locations/${user.username}`);
        const unsubLoc = onValue(locRef, (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                if (data.latitude && data.longitude) {
                    setMyLocation([data.latitude, data.longitude]);
                }
            }
        });

        // Fetch assigned PDVs
        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        const todayStr = new Date(d.getTime() - offset).toISOString().split('T')[0];
        
        const assignmentsRef = ref(db, `assignments/${todayStr}/${user.username}`);
        const unsubAssign = onValue(assignmentsRef, (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                const myVisits = Object.values(data).map(visit => ({
                    id: visit.id,
                    pdvName: visit.name,
                    pdvAddress: visit.address || visit.district,
                    status: visit.status || 'pending', // IMPORTANT FOR MARKER COLOR
                    latitude: visit.latitude,
                    longitude: visit.longitude
                })).filter(v => v.latitude && v.longitude); // Only map those with coordinates

                setVisits(myVisits);
            }
        });

        return () => {
            unsubLoc();
            unsubAssign();
        };
    }, [user]);

    // Center map on user or default to a central location (Lima)
    const center = myLocation || [-12.0464, -77.0428];

    // Memoize googleCenter to prevent re-panning on every render
    const googleCenter = React.useMemo(() => ({ lat: center[0], lng: center[1] }), [center[0], center[1]]);

    return (
        <div className="h-screen w-full flex flex-col relative">
            {/* Header (Floating Back Button) */}
            <div className="absolute top-6 left-6 z-[1000]">
                <button 
                    onClick={() => navigate('/executive/home')} 
                    className="bg-white rounded-full p-3 shadow-md border-gray-100 border text-gray-700 hover:bg-gray-50 transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                </button>
            </div>
            
            {/* Title chip */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[1000] bg-white rounded-full px-4 py-2 shadow-md border-gray-100 border flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-teal-600 rounded-full"></div>
                <span className="text-sm font-bold text-gray-700">Monitoreo de Ruta</span>
            </div>

            <MapContainer 
                center={center} 
                zoom={14} 
                className="flex-1 w-full"
                zoomControl={false}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />

                {/* Draw PDVs */}
                {visits.map((visit) => (
                    <Marker 
                        key={visit.id} 
                        position={[visit.latitude, visit.longitude]}
                        icon={visit.status === 'completed' ? pdvCompletedIcon : pdvIcon}
                    >
                        <Popup className="rounded-xl overflow-hidden shadow-sm -m-2">
                            <div className="p-1">
                                <h4 className="font-bold text-gray-800 text-sm">{visit.pdvName}</h4>
                                <p className="text-xs text-gray-500 mt-1">{visit.pdvAddress}</p>
                            </div>
                        </Popup>
                    </Marker>
                ))}

                {/* Draw Exec Location */}
                {myLocation && (
                    <Marker position={myLocation} zIndexOffset={1000} icon={userIcon}>
                        <Popup className="rounded-xl font-bold">Mi Ubicación Actual</Popup>
                    </Marker>
                )}
            </MapContainer>
        </div>
    );
};

export default ExecutiveRouteMap;
