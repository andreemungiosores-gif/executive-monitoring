import React, { useState, useEffect } from 'react';
import { ref, set, onValue, get } from 'firebase/database';
import { db } from '../../firebase';
import Papa from 'papaparse';

const PDVAssignment = () => {
    // --- STATE ---
    const [pdvs, setPdvs] = useState([]); // Master List
    const [vendors, setVendors] = useState([]); // Users List
    const [selectedDate, setSelectedDate] = useState(() => {
        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
    });
    const [selectedVendor, setSelectedVendor] = useState('');

    const [assignedPdvs, setAssignedPdvs] = useState([]); // Right Panel
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');

    const [searchTerm, setSearchTerm] = useState('');

    // --- EFFECTS ---

    // 1. Load Vendors (Users) from Github
    useEffect(() => {
        const loadVendors = async () => {
            try {
                const { supabase } = await import('../../utils/supabaseClient.js');
                const { data: parsedUsers, error } = await supabase.from('users').select('*');
                if (error) throw new Error("Error fetching users from Supabase");

                const activeSellers = parsedUsers.filter(u => u.is_active === true || u.is_active === 'True' || u.is_active === 'true');
                
                const vendorList = activeSellers.map(u => {
                    const realName = u.nombre_apellido;
                    const safeKey = u.id_usuario;
                    return { id: safeKey, name: realName };
                });

                // Dedup and sort
                const dedupedMap = new Map();
                vendorList.forEach(v => dedupedMap.set(v.id, v));
                const sortedVendors = Array.from(dedupedMap.values()).sort((a,b) => a.name.localeCompare(b.name));
                
                setVendors(sortedVendors);
            } catch (e) {
                console.error("Error cargando vendedores desde Github:", e);
            }
        };
        loadVendors();
    }, []);

    // 2. Load PDVs (Master Data) directly from Supabase
    useEffect(() => {
        const loadPdvs = async () => {
            try {
                const { supabase } = await import('../../utils/supabaseClient.js');
                
                let results = [];
                let from = 0;
                const step = 1000;
                let hasMore = true;

                while (hasMore) {
                    const { data, error } = await supabase
                        .from('clients')
                        .select('*')
                        .range(from, from + step - 1);
                        
                    if (error) throw error;
                    if (data && data.length > 0) {
                        results = [...results, ...data];
                        from += step;
                        if (data.length < step) hasMore = false;
                    } else {
                        hasMore = false;
                    }
                }
                
                const pdvList = [];
                results.forEach(row => {
                    const lat = parseFloat(row.latitud);
                    const lng = parseFloat(row.longitud);

                    if (row.id_pdv && !isNaN(lat) && !isNaN(lng)) {
                        let nameParts = [];
                        if (row.centro_medico && row.centro_medico.trim()) nameParts.push(row.centro_medico.trim());
                        if (row.doctor && row.doctor.trim()) {
                            let docName = row.doctor.trim();
                            if (!docName.toLowerCase().startsWith('dr') && !docName.toLowerCase().startsWith('dra')) {
                                docName = "Dr(a). " + docName;
                            }
                            nameParts.push(docName);
                        }
                        let name = nameParts.length > 0 ? nameParts.join(" - ") : "Sin Nombre";

                        const rawActive = row.is_active ? row.is_active.toString().trim() : "";
                        const isActive = rawActive !== "0" && rawActive.toLowerCase() !== "false";
                        
                        pdvList.push({
                            id: row.id_pdv,
                            name: name,
                            address: row.direccion || "",
                            district: row.distrito || "",
                            category: row.categoria || "",
                            speciality: row.especialidad || "",
                            latitude: lat,
                            longitude: lng,
                            active: isActive
                        });
                    }
                });
                
                setPdvs(pdvList);
            } catch (e) {
                console.error("Error loading PDVs from Supabase", e);
            }
        };
        
        loadPdvs();
    }, []);

    // 3. Load Assignments for Selected Date/Vendor
    useEffect(() => {
        if (!selectedVendor || !selectedDate) {
            setAssignedPdvs([]);
            return;
        }

        setLoading(true);
        const assignRef = ref(db, `assignments/${selectedDate}/${selectedVendor}`);
        get(assignRef).then((snapshot) => {
            if (snapshot.exists()) {
                setAssignedPdvs(Object.values(snapshot.val()));
            } else {
                setAssignedPdvs([]);
            }
            setLoading(false);
        });
    }, [selectedDate, selectedVendor]);


    // --- ACTIONS ---

    const handleAssign = (pdv) => {
        if (!selectedVendor) return alert("Selecciona un ejecutivo primero.");

        // Prevent Duplicates
        if (assignedPdvs.find(p => p.id === pdv.id)) return;

        setAssignedPdvs([...assignedPdvs, { ...pdv, assignedAt: Date.now() }]);
        setSaveStatus('unsaved');
    };

    const handleRemove = (pdvId) => {
        setAssignedPdvs(assignedPdvs.filter(p => p.id !== pdvId));
        setSaveStatus('unsaved');
    };

    const handleSave = async () => {
        if (!selectedVendor) return alert("Selecciona un ejecutivo.");
        if (!selectedDate) return alert("Selecciona una fecha.");

        try {
            setSaveStatus('saving');
            const assignRef = ref(db, `assignments/${selectedDate}/${selectedVendor}`);

            // 1. Fetch latest state from Firebase to prevent overwriting vendor's live progress
            const snap = await get(assignRef);
            const liveData = snap.exists() ? snap.val() : {};

            // 2. Convert Array to Object for Firebase
            const updateObj = {};
            assignedPdvs.forEach(p => {
                const liveItem = liveData[p.id] || {};
                
                const mergedP = { ...p };
                if (liveItem.status !== undefined) mergedP.status = liveItem.status;
                if (liveItem.verified !== undefined) mergedP.verified = liveItem.verified;
                if (liveItem.checkInTime !== undefined) mergedP.checkInTime = liveItem.checkInTime;
                if (liveItem.checkOutTime !== undefined) mergedP.checkOutTime = liveItem.checkOutTime;
                if (liveItem.fechaInicioForm !== undefined) mergedP.fechaInicioForm = liveItem.fechaInicioForm;

                // Firebase will crash if any property is explicitly undefined
                Object.keys(mergedP).forEach(key => {
                    if (mergedP[key] === undefined) {
                        delete mergedP[key];
                    }
                });

                updateObj[p.id] = mergedP;
            });

            // 3. Save
            if (assignedPdvs.length === 0) {
                await set(assignRef, null);
            } else {
                await set(assignRef, updateObj);
            }

            setSaveStatus('saved');
            setTimeout(() => setSaveStatus(''), 2000); // Clear success msg
        } catch (error) {
            console.error("Save Error", error);
            alert("Error al guardar: " + error.message);
            setSaveStatus('error');
        }
    };




    // --- FILTERING ---
    // Remove PDVs that are already assigned (Optional: currently listing all available, 
    // but maybe we want to visualize which ones are already added?)
    // Let's keep them in the list but show an "Added" state button.

    const normalizeString = (str) => {
        if (!str) return '';
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    };

    const filteredPdvs = pdvs.filter(p => {
        if (!p.active) return false;
        if (!searchTerm.trim()) return true;
        
        const searchTerms = normalizeString(searchTerm).split(' ').filter(term => term.trim() !== '');
        const combinedText = normalizeString(`${p.name || ''} ${p.district || ''}`);
        
        return searchTerms.every(term => combinedText.includes(term));
    });


    return (
        <div className="p-4 md:p-6 h-full flex flex-col overflow-auto md:overflow-hidden">

            {/* HERADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 flex-shrink-0">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold text-gray-800">Asignación de Rutas</h2>
                    <p className="text-sm md:text-base text-gray-500">Administra los puntos de venta para cada ejecutivo</p>
                </div>

                <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center bg-white p-2 rounded-xl shadow-sm border border-gray-100 w-full md:w-auto">
                    {/* Date Picker */}
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-red-500 w-full sm:w-auto flex-1 sm:flex-none"
                    />

                    {/* Vendor Select */}
                    <select
                        value={selectedVendor}
                        onChange={(e) => setSelectedVendor(e.target.value)}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-red-500 min-w-0 sm:min-w-[200px] flex-1 w-full sm:w-auto"
                    >
                        <option value="">-- Seleccionar Ejecutivo --</option>
                        {vendors.map(v => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                    </select>

                </div>
            </div>


            {/* MAIN SPLIT VIEW */}
            <div className="flex-1 flex flex-col lg:flex-row gap-6 lg:overflow-hidden min-h-0">

                {/* LEFT: AVAILABLE PDVS */}
                <div className="w-full lg:w-1/2 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col lg:overflow-hidden min-h-[400px] lg:min-h-0">
                    <div className="p-4 border-b border-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50/50 gap-3">
                        <h3 className="font-bold text-gray-700">Puntos Disponibles</h3>

                        <div className="relative w-full sm:w-64">
                            <input
                                type="text"
                                placeholder="Buscar clínica..."
                                className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                        {filteredPdvs.length === 0 ? (
                            <div className="p-8 text-center text-gray-400">
                                <p>No se encontraron PDVs</p>
                            </div>
                        ) : (
                            filteredPdvs.map(pdv => {
                                const isAssigned = assignedPdvs.some(p => p.id === pdv.id);
                                return (
                                    <div key={pdv.id} className="group p-3 hover:bg-gray-50 rounded-xl border border-transparent hover:border-gray-100 transition-all flex justify-between items-center">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500 flex-shrink-0">
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="font-bold text-gray-800 text-sm truncate">{pdv.name}</h4>
                                                <p className="text-xs text-gray-500 truncate">{pdv.address || pdv.district}</p>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => !isAssigned && handleAssign(pdv)}
                                            disabled={isAssigned || !selectedVendor}
                                            className={`w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center transition-colors ${isAssigned ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400 group-hover:bg-blue-100 group-hover:text-blue-600'}`}
                                        >
                                            {isAssigned ? (
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                            ) : (
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                            )}
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>


                {/* RIGHT: ASSIGNED LIST */}
                <div className="w-full lg:w-1/2 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col lg:overflow-hidden min-h-[400px] lg:min-h-0 relative">
                    <div className="p-4 border-b border-red-50 bg-red-50/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                            <h3 className="font-bold text-red-900 truncate max-w-[200px] sm:max-w-[300px]">Ruta: {vendors.find(v => v.id === selectedVendor)?.name || "..."}</h3>
                            <p className="text-xs text-red-400">{selectedDate}</p>
                        </div>

                        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                            <div className="flex flex-col items-end">
                                {saveStatus === 'saved' && <span className="text-green-600 font-bold text-sm animate-pulse">¡Guardado!</span>}
                                {saveStatus === 'unsaved' && <span className="text-orange-500 font-bold text-xs">Cambios sin guardar*</span>}
                            </div>
                            <button
                                onClick={handleSave}
                                disabled={!selectedVendor || saveStatus === 'saving'}
                                className={`px-4 py-2 rounded-lg font-bold text-white text-sm shadow-md transition-all whitespace-nowrap flex-shrink-0 ${saveStatus === 'saved' ? 'bg-green-500' : 'bg-red-600 hover:bg-red-700'}`}
                            >
                                {saveStatus === 'saving' ? 'Guardando...' : 'Guardar Cambios'}
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/30 custom-scrollbar relative">
                        {!selectedVendor ? (
                            <div className="absolute inset-0 flex items-center justify-center text-gray-400 p-4 text-center">
                                <p className="font-medium">Selecciona un ejecutivo para comenzar</p>
                            </div>
                        ) : assignedPdvs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-4 text-center">
                                <svg className="w-16 h-16 mb-2 opacity-30" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
                                <p>No hay puntos asignados para esta fecha</p>
                            </div>
                        ) : (
                            assignedPdvs.map(pdv => (
                                <div key={pdv.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center group animate-fadeIn">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-8 h-8 flex-shrink-0 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">
                                            {pdv.speciality ? pdv.speciality.charAt(0) : 'P'}
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="font-bold text-gray-800 text-sm truncate">{pdv.name}</h4>
                                            <p className="text-xs text-gray-500 truncate">{pdv.address || pdv.district}</p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleRemove(pdv.id)}
                                        className="text-gray-400 hover:text-red-500 transition-colors p-2 flex-shrink-0"
                                        title="Remover de la ruta"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PDVAssignment;
