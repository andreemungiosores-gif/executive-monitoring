import React, { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const VisitList = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [visits, setVisits] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || !user.username) return;

        // Use local date for querying
        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        const todayStr = new Date(d.getTime() - offset).toISOString().split('T')[0];

        // Path: assignments/DATE/USERNAME
        const assignmentsRef = ref(db, `assignments/${todayStr}/${user.username}`);

        const unsubscribe = onValue(assignmentsRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                // Data is an object where key=PdvID, value=PDV Object
                const myVisits = Object.values(data).map(visit => ({
                    id: visit.id,
                    pdvName: visit.name,
                    pdvAddress: visit.address || visit.district,
                    status: visit.status || 'pending',
                    latitude: visit.latitude,
                    longitude: visit.longitude,
                    category: visit.category,
                    speciality: visit.speciality,
                    phone: visit.phone || visit.telefono || '',
                    schedule: visit.schedule || visit.horario || ''
                }));

                setVisits(myVisits);
            } else {
                setVisits([]);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    if (loading) return <div className="p-4 text-center text-gray-400">Cargando visitas...</div>;

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800 px-1">Tu Ruta de Hoy</h3>

            {visits.length === 0 ? (
                <div className="bg-white p-6 rounded-xl shadow-sm text-center border-dashed border-2 border-gray-100">
                    <p className="text-gray-400 text-sm">No tienes visitas asignadas para hoy.</p>
                </div>
            ) : (
                visits.map((visit) => (
                    <div key={visit.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between relative overflow-hidden">
                        {/* Status Stripe */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${visit.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`}></div>

                        <div className="pl-3">
                            <h4 className="font-bold text-gray-900">{visit.pdvName}</h4>
                            <p className="text-xs text-gray-500 mt-1">{visit.pdvAddress}</p>

                            {/* Action Buttons (Mock for now) */}
                            <div className="mt-3 flex gap-2">

                                {visit.status !== 'completed' && (
                                    <button 
                                        onClick={() => navigate(`/executive/visit/${visit.id}`, { state: { visit } })}
                                        className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg font-semibold"
                                    >
                                        Registrar Visita
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col items-end">
                            {visit.status === 'completed' ? (
                                <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">
                                    COMPLETADO
                                </span>
                            ) : (
                                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                                    PENDIENTE
                                </span>
                            )}
                        </div>
                    </div>
                ))
            )}

            {visits.length > 0 && (
                <div className="pt-4 pb-2">
                    <button 
                        onClick={() => navigate('/executive/map')}
                        className="w-full bg-red-600 text-white font-bold py-3.5 rounded-xl shadow-md hover:bg-red-700 transition flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                        Ver en Mapa
                    </button>
                </div>
            )}
        </div>
    );
};

export default VisitList;
