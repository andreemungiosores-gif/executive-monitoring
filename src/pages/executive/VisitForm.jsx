import React, { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ref, update } from 'firebase/database';
import { db } from '../../firebase';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Share } from '@capacitor/share';

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
            // Only updating status to 'in_progress' and checkInTime per request (form data is not stored yet)
            await update(ref(db, `assignments/${todayStr}/${user.username}/${id}`), {
                status: 'in_progress',
                checkInTime: Date.now()
            });

            // Dictionary for better readable mapping
            const estadoMap = {
                'no_interes': 'No interés en la marca',
                'interes': 'Interés en la marca',
                'en_proceso': 'En proceso de seguimiento',
                'compra_potencial': 'Compra potencial',
                'venta_concretada': 'Venta concretada'
            };
            const recMap = {
                'efectiva': 'EFECTIVA (Contacto con médico)',
                'positiva': 'POSITIVA (Avance sin contacto)',
                'negativa': 'NEGATIVA (Sin contacto relevante)'
            };

            const reportText = `📍 *Visita:* ${pdvName}\n👤 *Ejecutivo:* ${user.name}\n📋 *Estado:* ${estadoMap[estado]}\n🤝 *Recepción:* ${recMap[recepcion]}\n💬 *Comentario:* ${comentario.trim()}`;

            // Trigger Native Share
            try {
                // Ensure we pass a native file URI (file://...) which is stored in photoData.path on Android
                await Share.share({
                    title: 'Reporte de Visita',
                    text: reportText,
                    url: photoData.path || photoData.webPath,
                    dialogTitle: 'Enviar reporte a...'
                });
            } catch (shareErr) {
                console.warn("Error sharing to WhatsApp/Native", shareErr);
                // We do not block the flow if user cancels the share or there's an error.
            }
            
            // Navigate back to VisitDetail
            navigate(-1);
        } catch (error) {
            console.error("Error al registrar ingreso", error);
            alert("Error al registrar: " + error.message);
            setSubmitting(false);
        }
    };

    const handleTakePhoto = async () => {
        try {
            const image = await Camera.getPhoto({
                quality: 60,
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
                        <option value="no_interes">No interés en la marca</option>
                        <option value="interes">Interés en la marca</option>
                        <option value="en_proceso">En proceso de seguimiento</option>
                        <option value="compra_potencial">Compra potencial</option>
                        <option value="venta_concretada">Venta concretada</option>
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
                        <option value="efectiva">EFECTIVA: Contacto con médico</option>
                        <option value="positiva">POSITIVA: Avance sin contacto</option>
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
