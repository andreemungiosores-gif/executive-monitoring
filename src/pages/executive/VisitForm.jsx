import React, { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ref, update } from 'firebase/database';
import { db } from '../../firebase';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Share } from '@capacitor/share';
import { Geolocation } from '@capacitor/geolocation';

const formatDateStr = (dateVal) => {
    // Expected Output: "2025-08-13 18:19:47"
    const d = new Date(dateVal);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const formatTimeDiff = (start, end) => {
    let diff = Math.floor((end - start) / 1000);
    if (diff < 0) diff = 0;
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

const escapeCSV = (str) => {
    if (!str) return "";
    let s = String(str);
    s = s.replace(/"/g, '""');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s}"`;
    }
    return s;
};

const VisitForm = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const visit = location.state?.visit;
    const { user } = useAuth();
    
    // States for form (not stored to DB yet per user request, but managed for UI)
    const [submitting, setSubmitting] = useState(false);
    const [estado, setEstado] = useState('');
    const [recepcion, setRecepcion] = useState('');
    const [comentario, setComentario] = useState('');
    const [photoData, setPhotoData] = useState(null);

    if (!visit) {
        return (
            <div className="p-6 text-center">
                <p>No se encontró la información de la visita.</p>
                <button onClick={() => navigate(-1)} className="mt-4 text-blue-500 underline">Volver</button>
            </div>
        );
    }

    const { pdvName } = visit;

    const uploadPhotoToGithub = async (photo, userId) => {
        const token = import.meta.env.VITE_GITHUB_TOKEN;
        
        // Convert to Blob then Base64
        const response = await fetch(photo.webPath);
        const blob = await response.blob();
        
        const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result.replace(/^data:.+;base64,/, '');
                resolve(base64String);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        const timestamp = Date.now();
        const filename = `visita_${userId}_${timestamp}.jpg`;
        const apiUrl = `https://api.github.com/repos/medicaltech-peru/fullstack-template/contents/frontend/public/db/photos_users/${filename}`;
        
        const putRes = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `upload: photo ${filename}`,
                content: base64Data
            })
        });
        
        if (!putRes.ok) throw new Error("Error subiendo foto a GitHub");
        
        return `/db/photos_users/${filename}`;
    };

    const uploadCSVToGithub = async (csvRow) => {
        const token = import.meta.env.VITE_GITHUB_TOKEN;
        const repoUrl = 'https://api.github.com/repos/medicaltech-peru/fullstack-template/contents/frontend/public/db/visits_reports.csv';

        // 1. Fix crítico: Obtener solo el SHA del archivo maestro para el guardado. 
        // GitHub API `/contents` oculta el código base64 truncando el archivo si pesa más de 1MB.
        const getRes = await fetch(repoUrl, { headers: { 'Authorization': `token ${token}` } });
        if (!getRes.ok) throw new Error("Error obteniendo metadata de visits_reports.csv");

        const json = await getRes.json();
        const sha = json.sha;

        // 2. Descargar el historial completo intacto desde Raw User Content (By-pass límites de Megabytes).
        // Usamos cache busting t=Date.now()
        const rawUrl = `https://raw.githubusercontent.com/medicaltech-peru/fullstack-template/main/frontend/public/db/visits_reports.csv?t=${Date.now()}`;
        const rawRes = await fetch(rawUrl, { headers: { 'Authorization': `token ${token}` } });
        if (!rawRes.ok) throw new Error("Error extrayendo los datos puros RAW de visits_reports.csv");
        
        const decodedContent = await rawRes.text();

        // 3. Empalmar filas y reconvertir a UTF-8 base 64 final.
        const newCsv = decodedContent.trim() + '\n' + csvRow;

        const encoder = new TextEncoder();
        const encodedBytes = encoder.encode(newCsv);
        let binStr = "";
        for(let i=0; i<encodedBytes.length; i++) binStr += String.fromCharCode(encodedBytes[i]);
        const base64Payload = window.btoa(binStr);

        const putRes = await fetch(repoUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `add: visit report csv row`,
                content: base64Payload,
                sha: sha
            })
        });

        if (!putRes.ok) throw new Error("Error grabando registro en visits_reports.csv");
    };

    const handleSubmit = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        
        if (!photoData) {
            alert("Es obligatorio tomar la evidencia fotográfica antes de enviar.");
            return;
        }
        if (!estado) {
            alert("Es obligatorio seleccionar el estado del seguimiento.");
            return;
        }
        if (!recepcion) {
            alert("Es obligatorio seleccionar la recepción de la visita.");
            return;
        }
        if (!comentario || comentario.trim() === '') {
            alert("Es obligatorio ingresar los comentarios de la visita.");
            return;
        }

        if (!user || submitting) return;
        setSubmitting(true);

        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        const todayStr = new Date(d.getTime() - offset).toISOString().split('T')[0];

        try {
            // Update firebase real-time UI tracking locally
            await update(ref(db, `assignments/${todayStr}/${user.username}/${id}`), {
                status: 'in_progress'
            });

            // GITHUB REPORT COMPOSITION:
            const startMs = location.state?.fechaInicioForm || Date.now();
            const endMs = Date.now();
            const startStr = formatDateStr(startMs);
            const endStr = formatDateStr(endMs);
            const timeDiff = formatTimeDiff(startMs, endMs);

            let lat = "";
            let lng = "";
            // OPTIMIZATION 1: Discarded heavy infinite GPS blocking loop for coords.

            // Dictionaries for mapping the values to full user-readable text for the CSV and Native Share
            const estadoMap = {
                'no_interes': 'NO INTERÉS EN LA MARCA',
                'interes': 'INTERÉS EN LA MARCA',
                'en_proceso': 'EN PROCESO SEGUIMIENTO',
                'compra_potencial': 'COMPRA POTENCIAL',
                'venta_concretada': 'VENTA CONCRETADA'
            };
            const recMap = {
                'efectiva': 'EFECTIVA: Contacto con Médico',
                'positiva': 'POSITIVA: Avance pero sin contacto con médico',
                'negativa': 'NEGATIVA: No hubo contacto relevante'
            };

            const fullEstadoStr = estadoMap[estado] || estado;
            const fullRecStr = recMap[recepcion] || recepcion;

            // OPTIMIZATION 3: Trigger Whatsapp natively INSTANTLY because it doesn't need cloud photoUrl
            const reportText = `📍 *Visita:* ${pdvName}\n👤 *Ejecutivo:* ${user.name}\n📋 *Estado:* ${fullEstadoStr}\n🤝 *Recepción:* ${fullRecStr}\n💬 *Comentario:* ${comentario.trim()}`;
            
            const nativeSharePromise = Share.share({
                title: 'Reporte de Visita',
                text: reportText,
                url: photoData.path || photoData.webPath,
                dialogTitle: 'Enviar reporte a...'
            }).catch(e => console.warn("Share to native cancelled or failed", e));
            
            // OPTIMIZATION 3: While Whatsapp share is open, Network uploads in the background!
            const photoUrl = await uploadPhotoToGithub(photoData, user.id);

            // Construct row payload
            const rowArr = [
                startStr,
                endStr,
                timeDiff,
                lat,
                lng,
                "", // distancia_pdv_metros
                "Reporte de Visita",
                "", // ID PDV
                visit.id || "", // id_pdv
                user.id || "", // id_usuario
                photoUrl,
                comentario,
                fullRecStr,
                fullEstadoStr,
                "", // tematica_visita
                ""  // is_llm_categorized
            ];

            const csvRow = rowArr.map(escapeCSV).join(',');
            await uploadCSVToGithub(csvRow);

            // Await Share wrapper to ensure smooth unmount. 
            await nativeSharePromise;
            
            navigate(-1);
        } catch (error) {
            console.error("Error al publicar reporte en Github", error);
            alert("Error de Sincronización: " + error.message);
            setSubmitting(false);
        }
    };

    const handleTakePhoto = async () => {
        try {
            const image = await Camera.getPhoto({
                quality: 60,
                width: 1080, // OPTIMIZATION 2: Heavy compression of raw dimension
                allowEditing: false,
                resultType: CameraResultType.Uri,
                source: CameraSource.Camera // Forces camera only, not gallery
            });
            setPhotoData(image);
        } catch (error) {
            console.error("Camera error:", error);
            // Ignore error if user cancelled
        }
    };

    return (
        <div className="bg-gray-50 min-h-screen flex flex-col relative w-full pb-32">
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
                    Formulario de Visita
                </h1>
            </div>

            {/* Content List of Fields */}
            <form className="flex-1 px-4 mt-6 relative z-10 flex flex-col gap-4" onSubmit={handleSubmit}>
                
                {/* Photo Upload */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <p className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">Tomar evidencia fotográfica</p>
                    <div 
                        onClick={handleTakePhoto}
                        className={`border-2 ${photoData ? 'border-solid border-green-400 bg-green-50' : 'border-dashed border-gray-200 bg-gray-50'} rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer active:bg-gray-100 transition-colors relative overflow-hidden`}
                    >
                        {photoData ? (
                            <>
                                <img src={photoData.webPath} alt="Evidencia" className="absolute inset-0 w-full h-full object-cover opacity-30" />
                                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-3 z-10">
                                    <svg className="w-6 h-6 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <p className="text-green-600 font-bold text-sm z-10">Evidencia Adjuntada</p>
                                <p className="text-gray-500 text-xs mt-1 z-10">Toque para retraer</p>
                            </>
                        ) : (
                            <>
                                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-3">
                                    <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <p className="text-red-500 font-bold text-sm">Tomar Foto</p>
                                <p className="text-gray-400 text-xs mt-1">Solo captura directa</p>
                            </>
                        )}
                    </div>
                </div>

                {/* Seguimiento Select */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
                        Estado del Seguimiento
                    </label>
                    <select 
                        value={estado}
                        onChange={(e) => setEstado(e.target.value)}
                        required
                        className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl py-3 px-4 focus:ring-2 focus:ring-red-500 focus:outline-none appearance-none font-medium"
                    >
                        <option value="" disabled>Seleccione una opción...</option>
                        <option value="no_interes">NO INTERÉS EN LA MARCA</option>
                        <option value="interes">INTERÉS EN LA MARCA</option>
                        <option value="en_proceso">EN PROCESO SEGUIMIENTO</option>
                        <option value="compra_potencial">COMPRA POTENCIAL</option>
                        <option value="venta_concretada">VENTA CONCRETADA</option>
                    </select>
                </div>

                {/* Recepcion Select */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
                        Recepción de la visita
                    </label>
                    <select 
                        value={recepcion}
                        onChange={(e) => setRecepcion(e.target.value)}
                        required
                        className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl py-3 px-4 focus:ring-2 focus:ring-red-500 focus:outline-none appearance-none font-medium"
                    >
                        <option value="" disabled>Seleccione una opción...</option>
                        <option value="efectiva">EFECTIVA: Contacto con Médico</option>
                        <option value="positiva">POSITIVA: Avance pero sin contacto con médico</option>
                        <option value="negativa">NEGATIVA: No hubo contacto relevante</option>
                    </select>
                </div>

                {/* Comentarios Textarea */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
                        Comentarios de visita
                    </label>
                    <textarea 
                        value={comentario}
                        onChange={(e) => setComentario(e.target.value)}
                        placeholder="Ingrese detalles sobre la interacción de la visita..."
                        rows={4}
                        required
                        className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl py-3 px-4 focus:ring-2 focus:ring-red-500 focus:outline-none font-medium resize-none"
                    />
                </div>

            </form>

            <div className="fixed bottom-0 left-0 w-full bg-white px-4 pt-4 pb-10 border-t border-gray-100 flex gap-4 z-50">
                <button 
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="w-full bg-[#E83C30] text-white rounded-2xl py-4 font-bold text-[16px] flex justify-center items-center shadow-md shadow-red-200 hover:bg-red-600 transition disabled:opacity-70"
                >
                    {submitting ? 'Enviando...' : 'Enviar >'}
                </button>
            </div>

        </div>
    );
};

export default VisitForm;
