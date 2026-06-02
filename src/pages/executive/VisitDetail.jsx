import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Share } from '@capacitor/share';
import { ref, update, onValue } from 'firebase/database';
import { db } from '../../firebase';
import { supabase } from '../../utils/supabaseClient';

// Helper to convert arrays like [9, 10, 11] to "9-12", and [9, 10, 11, 15, 16] to "9-12 y 15-17"
function formatHoursArray(hoursArray) {
    if (!Array.isArray(hoursArray) || hoursArray.length === 0) return '';
    const sorted = [...new Set(hoursArray.map(Number))].sort((a, b) => a - b);
    
    const ranges = [];
    let rangeStart = sorted[0];
    let rangeEnd = sorted[0];
    
    for (let i = 1; i <= sorted.length; i++) {
        if (i < sorted.length && sorted[i] === rangeEnd + 1) {
            rangeEnd = sorted[i];
        } else {
            ranges.push(`${rangeStart}-${rangeEnd + 1}`);
            if (i < sorted.length) {
                rangeStart = sorted[i];
                rangeEnd = sorted[i];
            }
        }
    }
    return ranges.join(' y ');
}

const VisitDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const visit = location.state?.visit;
    const { user } = useAuth();
    
    // Status states
    const [submitting, setSubmitting] = useState(false);

    if (!visit) {
        return (
            <div className="p-6 text-center">
                <p>No se encontró la información de la visita.</p>
                <button onClick={() => navigate(-1)} className="mt-4 text-blue-500 underline">Volver</button>
            </div>
        );
    }

    const { pdvName, pdvAddress, category, speciality, phone, schedule } = visit;
    
    // Status live fetching
    const [liveStatus, setLiveStatus] = useState(visit.status || 'pending');

    // Supabase comments & sales history states
    const [comments, setComments] = useState([]);
    const [sales, setSales] = useState([]);
    const [loadingData, setLoadingData] = useState(true);
    const [activeTab, setActiveTab] = useState('comments'); // 'comments' or 'sales'

    // Fresh client details states from Supabase
    const [livePhone, setLivePhone] = useState(visit.phone || 'No especificado');
    const [liveSchedule, setLiveSchedule] = useState(visit.schedule || '');

    useEffect(() => {
        if (!id) return;

        const fetchData = async () => {
            try {
                setLoadingData(true);
                // 1. Fetch last 3 comments from visits_reports
                const { data: visits, error: vError } = await supabase
                    .from('visits_reports')
                    .select('comentario_visita, fecha_inicio_form, id_usuario')
                    .eq('id_pdv', id)
                    .order('fecha_inicio_form', { ascending: false })
                    .limit(3);

                let fetchedComments = [];
                if (!vError && visits) {
                    const userIds = [...new Set(visits.map(v => v.id_usuario).filter(Boolean))];
                    let usersMap = {};
                    if (userIds.length > 0) {
                        const { data: users, error: uError } = await supabase
                            .from('users')
                            .select('id_usuario, nombre_apellido')
                            .in('id_usuario', userIds);
                        if (!uError && users) {
                            users.forEach(u => {
                                usersMap[u.id_usuario] = u.nombre_apellido;
                            });
                        }
                    }
                    fetchedComments = visits.map(v => ({
                        comentario: v.comentario_visita || 'Sin comentario',
                        fecha: v.fecha_inicio_form ? new Date(v.fecha_inicio_form).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Fecha desconocida',
                        vendedor: usersMap[v.id_usuario] || 'Vendedor Desconocido'
                    }));
                }
                setComments(fetchedComments);

                // 2. Fetch sales and client details from clients
                const { data: clientData, error: cError } = await supabase
                    .from('clients')
                    .select('historial_ventas_completo, numero, numero_1, numero_2, numero_3, horas_lunes, horas_martes, horas_miercoles, horas_jueves, horas_viernes, horas_sabado')
                    .eq('id_pdv', id)
                    .single();

                if (!cError && clientData) {
                    // a. Process phone numbers
                    const phoneNumbers = [clientData.numero, clientData.numero_1, clientData.numero_2, clientData.numero_3]
                        .map(n => String(n || '').trim())
                        .filter(Boolean);
                    if (phoneNumbers.length > 0) {
                        setLivePhone(phoneNumbers.join(' / '));
                    } else {
                        setLivePhone('No especificado');
                    }

                    // b. Process schedule
                    const days = [
                        { name: 'Lunes', data: clientData.horas_lunes },
                        { name: 'Martes', data: clientData.horas_martes },
                        { name: 'Miércoles', data: clientData.horas_miercoles },
                        { name: 'Jueves', data: clientData.horas_jueves },
                        { name: 'Viernes', data: clientData.horas_viernes },
                        { name: 'Sábado', data: clientData.horas_sabado }
                    ];
                    
                    const daySchedules = days.map(d => {
                        let hrs = d.data;
                        if (typeof hrs === 'string') {
                            try { hrs = JSON.parse(hrs); } catch(e) { hrs = null; }
                        }
                        return { name: d.name, formatted: formatHoursArray(hrs) };
                    });

                    const activeSchedules = daySchedules.filter(ds => ds.formatted);
                    if (activeSchedules.length > 0) {
                        const groups = {};
                        daySchedules.forEach(ds => {
                            if (!ds.formatted) return;
                            if (!groups[ds.formatted]) groups[ds.formatted] = [];
                            groups[ds.formatted].push(ds.name);
                        });
                        
                        const scheduleParts = [];
                        for (const [sched, dayNames] of Object.entries(groups)) {
                            const shortDays = dayNames.map(n => n.slice(0, 3));
                            const standardWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                            const indices = dayNames.map(n => standardWeek.indexOf(n)).sort((a,b) => a-b);
                            
                            let daysStr = '';
                            const isConsecutive = indices.length > 1 && indices[indices.length - 1] - indices[0] === indices.length - 1;
                            if (isConsecutive) {
                                daysStr = `${shortDays[0]} a ${shortDays[shortDays.length - 1]}`;
                            } else {
                                daysStr = shortDays.join(', ');
                            }
                            scheduleParts.push(`${daysStr}: ${sched}`);
                        }
                        setLiveSchedule(scheduleParts.join(' | '));
                    } else {
                        setLiveSchedule('');
                    }

                    // c. Process sales history
                    let salesHistory = clientData.historial_ventas_completo;
                    if (typeof salesHistory === 'string') {
                        try {
                            salesHistory = JSON.parse(salesHistory);
                        } catch (e) {
                            salesHistory = [];
                        }
                    }
                    if (Array.isArray(salesHistory)) {
                        // 1. Sort all sales by date descending
                        const sortedSales = salesHistory.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
                        
                        // 2. Extract unique dates
                        const uniqueDates = [...new Set(sortedSales.map(s => s.fecha).filter(Boolean))];
                        
                        // 3. Take the top 3 latest unique dates
                        const top3Dates = uniqueDates.slice(0, 3);
                        
                        // 4. Filter sales to only include those 3 dates
                        const filteredSales = sortedSales.filter(s => top3Dates.includes(s.fecha));
                        
                        setSales(filteredSales);
                    }
                }
            } catch (err) {
                console.error("Error fetching detail data:", err);
            } finally {
                setLoadingData(false);
            }
        };

        fetchData();
    }, [id]);

    React.useEffect(() => {
        if (!user || !user.username || !id) return;
        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        const todayStr = new Date(d.getTime() - offset).toISOString().split('T')[0];
        
        const visitRef = ref(db, `assignments/${todayStr}/${user.username}/${id}`);
        const unsub = onValue(visitRef, (snap) => {
            if (snap.exists()) {
                setLiveStatus(snap.val().status || 'pending');
            }
        });
        return () => unsub();
    }, [user, id]);

    const handleMarcarIngreso = async () => {
        const isTracking = localStorage.getItem('isTracking') === 'true';
        if (!isTracking) {
            alert("⚠️ Acceso denegado.\n\nPara poder registrar la visita al PDV (" + pdvName + "), primero debes ir al menú principal y presionar el botón 'MARCAR ENTRADA' para iniciar el rastreo de tu jornada.");
            return;
        }

        const fechaInicio = Date.now();

        // Write to Firebase immediately so AdminMap updates instantly
        if (user && user.username && id) {
            try {
                const d = new Date();
                const offset = d.getTimezoneOffset() * 60000;
                const todayStr = new Date(d.getTime() - offset).toISOString().split('T')[0];
                
                await update(ref(db, `assignments/${todayStr}/${user.username}/${id}`), {
                    status: 'in_progress',
                    checkInTime: fechaInicio
                });
            } catch (e) {
                console.error("Error tracking checkInTime instantly:", e);
            }
        }

        // --- NATIVE CAMERA & SHARE CHECK-IN ---
        try {
            const image = await Camera.getPhoto({
                quality: 80,
                allowEditing: false,
                resultType: CameraResultType.Uri,
                source: CameraSource.Camera // Strict to Live Camera only
            });

            const currentObjDate = new Date(fechaInicio);
            const timeStr = currentObjDate.toLocaleTimeString();
            const executiveName = user.nombre_apellido || user.name || user.username;
            
            const shareText = `*INGRESO A PDV*\n👤 *Ejecutivo:* ${executiveName}\n📍 *PDV:* ${pdvName}\n🗺️ *Dirección:* ${pdvAddress}\n⏰ *Hora:* ${timeStr}`;

            await Share.share({
                title: 'Ingreso a PDV',
                text: shareText,
                url: image.path,
                dialogTitle: 'Compartir Ingreso'
            });

            // Prevent React Router from glitching due to Share sheet popping down immediately
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            console.log("Cámara cancelada o falló el compartir:", error);
            alert("⚠️ Debes tomar y compartir tu foto de ingreso para proceder con la visita.");
            
            // ROLLBACK ESTADO Y CHECK-IN
            if (user && user.username && id) {
                try {
                    const d = new Date();
                    const offset = d.getTimezoneOffset() * 60000;
                    const todayStr = new Date(d.getTime() - offset).toISOString().split('T')[0];
                    
                    await update(ref(db, `assignments/${todayStr}/${user.username}/${id}`), {
                        status: 'pending',
                        checkInTime: null
                    });
                } catch (e) {
                    console.error("Error al revertir estado:", e);
                }
            }
            return; // ABORT NAVIGATION
        }

        navigate(`/executive/visit/${id}/form`, { state: { visit, fechaInicioForm: fechaInicio } });
    };

    const handleMarcarSalida = async () => {
        if (!user || submitting) return;
        setSubmitting(true);

        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        const todayStr = new Date(d.getTime() - offset).toISOString().split('T')[0];

        try {
            await update(ref(db, `assignments/${todayStr}/${user.username}/${id}`), {
                status: 'completed',
                checkOutTime: Date.now()
            });
            alert("Salida registrada correctamente.");
            navigate('/executive/home');
        } catch (e) {
            console.error("Error al registrar salida", e);
            alert("Error al registrar: " + e.message);
            setSubmitting(false);
        }
    };

    return (
        <div className="bg-gray-50 min-h-screen flex flex-col relative w-full pb-24">
            {/* Header */}
            <div className="bg-white px-4 py-4 flex items-center shadow-sm relative z-10 space-y-0">
                <button 
                    onClick={() => navigate(-1)}
                    className="p-2 -ml-2 text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1 className="flex-1 text-center font-bold text-gray-800 text-lg mr-8">
                    Detalle de Visita
                </h1>
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                </div>
            </div>

            {/* Blue background accent (simulated via background gradient) */}
            <div className="absolute top-14 left-0 w-full h-32 bg-[#F7F9FC] z-0 hidden lg:block"></div>

            <div className="flex-1 px-4 mt-6 relative z-10 flex flex-col">
                
                {/* Shop Icon Bubble */}
                <div className="mx-auto w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-md mb-[-32px] relative z-20 border-4 border-gray-50">
                    <svg className="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z" />
                    </svg>
                </div>

                {/* Main Card */}
                <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] pt-12 pb-8 px-6 border border-gray-100 flex-1">
                    
                    {/* Badge & Status */}
                    <div className="flex justify-between items-start mb-4">
                        <span className="bg-blue-100 text-blue-600 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                            {category ? `Categoría: ${category}` : (speciality || "FARMACIA / PDV")}
                        </span>
                        
                        <div className="w-8 h-8 bg-green-50 text-green-500 rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                            </svg>
                        </div>
                    </div>

                    {/* Titles */}
                    <h2 className="text-2xl font-extrabold text-[#1a2332] leading-tight mb-2">
                        {pdvName || "Centro Médico / Farmacia"}
                    </h2>
                    
                    <div className="flex items-start gap-2 text-gray-500 mb-6">
                        <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                        <p className="text-sm font-medium leading-snug">{pdvAddress}</p>
                    </div>

                    {/* Schedule Block */}
                    {liveSchedule && (
                        <div className="bg-[#FAF9F6] rounded-2xl p-4 flex gap-3 items-center mb-6">
                            <div className="bg-red-100 text-red-500 p-1.5 rounded-full">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
                                </svg>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mb-0.5">Horario de Atención</p>
                                <p className="text-sm font-bold text-gray-800">{liveSchedule}</p>
                            </div>
                        </div>
                    )}

                    {/* Divider */}
                    <hr className="border-gray-100 mb-6" />

                    {/* Contact Info (Split Layout) */}
                    <div className="flex justify-end items-center">
                        <div className="text-right">
                            <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mb-1">Teléfono</p>
                            <div className="flex items-center gap-2 justify-end">
                                <p className="font-bold text-gray-800">{livePhone}</p>
                                {livePhone !== 'No especificado' && (
                                    <svg className="w-3.5 h-3.5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
                                    </svg>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Divider */}
                    <hr className="border-gray-100 my-4" />

                    {/* Tabs Header */}
                    <div className="flex border-b border-gray-100 mb-4 mt-2">
                        <button
                            onClick={() => setActiveTab('comments')}
                            className={`flex-1 pb-2.5 text-xs font-bold border-b-2 transition-all ${activeTab === 'comments' ? 'border-[#E83C30] text-[#E83C30]' : 'border-transparent text-gray-400'}`}
                        >
                            Últimas Visitas ({comments.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('sales')}
                            className={`flex-1 pb-2.5 text-xs font-bold border-b-2 transition-all ${activeTab === 'sales' ? 'border-[#E83C30] text-[#E83C30]' : 'border-transparent text-gray-400'}`}
                        >
                            Historial Ventas ({sales.length})
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="max-h-64 overflow-y-auto custom-scrollbar pr-1">
                        {loadingData ? (
                            <div className="py-8 text-center text-xs text-gray-400 animate-pulse">Cargando información...</div>
                        ) : activeTab === 'comments' ? (
                            comments.length === 0 ? (
                                <div className="py-8 text-center text-xs text-gray-400">No hay visitas o comentarios registrados.</div>
                            ) : (
                                <div className="space-y-2.5">
                                    {comments.map((c, i) => (
                                        <div key={i} className="bg-[#F8F9FA] rounded-2xl p-3 border border-gray-100 shadow-sm">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[10px] font-bold text-[#1a2332]">{c.vendedor}</span>
                                                <span className="text-[9px] text-gray-400 font-semibold">{c.fecha}</span>
                                            </div>
                                            <p className="text-xs text-gray-600 italic leading-snug">"{c.comentario}"</p>
                                        </div>
                                    ))}
                                </div>
                            )
                        ) : (
                            sales.length === 0 ? (
                                <div className="py-8 text-center text-xs text-gray-400">No hay ventas registradas para este punto.</div>
                            ) : (
                                <div className="space-y-2">
                                    {sales.map((s, i) => (
                                        <div key={i} className="bg-[#F8F9FA] rounded-2xl p-3 border border-gray-100 flex items-center justify-between gap-3 shadow-sm">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-extrabold text-[#1a2332] leading-snug">{s.producto}</p>
                                                <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                                                    {s.fecha ? new Date(s.fecha + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Fecha desconocida'} • {s.forma_pago || 'Pago no especificado'}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}
                    </div>

                </div>
            </div>

            {/* Bottom Actions Fixed */}
            <div className="fixed bottom-0 left-0 w-full bg-white px-6 pt-5 pb-10 border-t border-gray-100 shadow-[0_-4px_20px_rgb(0,0,0,0.03)] flex gap-4 z-50 rounded-t-3xl">
                <button 
                    onClick={handleMarcarIngreso}
                    disabled={liveStatus !== 'pending' || submitting}
                    className={`flex-1 rounded-2xl py-4 font-bold text-[15px] flex justify-center items-center gap-2 transition ${liveStatus === 'pending' ? 'bg-[#E83C30] text-white shadow-md shadow-red-200 hover:bg-red-600' : 'bg-gray-100 text-gray-400'}`}
                >
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    Marcar Ingreso
                </button>
                
                <button 
                    onClick={handleMarcarSalida}
                    disabled={liveStatus !== 'in_progress' || submitting}
                    className={`flex-1 rounded-2xl py-4 font-bold text-[15px] flex justify-center items-center gap-2 transition ${liveStatus === 'in_progress' ? 'bg-[#E83C30] text-white shadow-md shadow-red-200 hover:bg-red-600' : 'bg-[#F4F5F7] text-[#9EA6B5]'}`}
                >
                    Marcar Salida
                    <svg className={`w-5 h-5 flex-shrink-0 ${liveStatus === 'in_progress' ? 'opacity-100' : 'opacity-70'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                </button>
            </div>
            
            {/* Range Text Indicator (Below buttons - actually image shows it below the red button but inside the standard flow. I put the buttons fixed at bottom so I can put the range indicator above them or just inside the bottom area) */}
            <div className="fixed bottom-[116px] left-0 w-full text-center z-40">
                <div className="inline-flex items-center gap-1.5 bg-white/90 backdrop-blur px-3 py-1 rounded-full">
                    <svg className="w-3 h-3 text-[#10B981]" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                    <span className="text-[10px] font-bold text-[#828D9F] uppercase tracking-wide">ESTÁS DENTRO DEL RANGO DE VISITA (15m)</span>
                </div>
            </div>
        </div>
    );
};

export default VisitDetail;
