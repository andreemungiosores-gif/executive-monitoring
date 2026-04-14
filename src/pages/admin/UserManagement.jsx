import React, { useState, useEffect } from 'react';

const apiUrl = 'https://api.github.com/repos/medicaltech-peru/fullstack-template/contents/frontend/public/db/users.csv';

const parseCSV = (csv) => {
    const lines = csv.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        const values = line.split(',');
        return headers.reduce((obj, header, i) => {
            obj[header] = values[i] !== undefined ? values[i].trim() : '';
            return obj;
        }, {});
    });
};

const stringifyCSV = (data) => {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const csv = [
        headers.join(','),
        ...data.map(row => headers.map(h => row[h] || '').join(','))
    ].join('\n');
    return csv;
};

const UserManagement = () => {
    const [allUsers, setAllUsers] = useState([]);
    const [fileSha, setFileSha] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newSeller, setNewSeller] = useState({ nombre_corto: '', nombre_apellido: '', pass: '123' });

    const [editingUser, setEditingUser] = useState(null);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        setIsLoading(true);
        try {
            const token = import.meta.env.VITE_GITHUB_TOKEN;
            if (!token) throw new Error("Falta el TOKEN de Github en las variables de entorno.");

            const res = await fetch(apiUrl, {
                headers: { 'Authorization': `token ${token}` }
            });
            if (!res.ok) throw new Error("Error al obtener el archivo desde Github.");
            
            const json = await res.json();
            setFileSha(json.sha);
            
            const decodedContent = decodeURIComponent(escape(window.atob(json.content.replace(/\n/g, ''))));
            let parsed = parseCSV(decodedContent);
            
            parsed = parsed.map(u => {
                if (typeof u.pass === 'undefined') u.pass = "123";
                return u;
            });
            
            setAllUsers(parsed);
        } catch (e) {
            console.error(e);
            alert("Error: " + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const saveToGitHub = async (updatedDataStr) => {
        try {
            const token = import.meta.env.VITE_GITHUB_TOKEN;
            const contentEncoded = window.btoa(unescape(encodeURIComponent(updatedDataStr)));

            const response = await fetch(apiUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: 'Update users.csv passwords and accounts via Dashboard',
                    content: contentEncoded,
                    sha: fileSha
                })
            });

            if (!response.ok) throw new Error("Error al hacer push o el archivo fue modificado externamente.");

            const json = await response.json();
            setFileSha(json.content.sha); 
            return true;
        } catch (e) {
            console.error(e);
            alert("No se pudo guardar en GitHub: " + e.message);
            return false;
        }
    };

    const handleCreateSeller = async (e) => {
        e.preventDefault();
        if (!newSeller.nombre_corto || !newSeller.nombre_apellido) return;

        const randomId = [...Array(24)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

        const newUserObj = {
            id_usuario: randomId,
            nombre_corto: newSeller.nombre_corto,
            nombre_apellido: newSeller.nombre_apellido,
            is_active: 'True',
            rol: 'reporteador',
            pass: newSeller.pass
        };

        const updatedList = [...allUsers, newUserObj];
        setAllUsers(updatedList);
        
        setIsAddModalOpen(false);
        setNewSeller({ nombre_corto: '', nombre_apellido: '', pass: '123' });

        const csvString = stringifyCSV(updatedList);
        const success = await saveToGitHub(csvString);
        if (success) alert("Vendedor creado y sincronizado a GitHub con éxito.");
    };

    const handleUpdateSeller = async (e) => {
        e.preventDefault();
        if (!editingUser.nombre_corto || !editingUser.nombre_apellido) return;

        const updatedList = allUsers.map(u => u.id_usuario === editingUser.id_usuario ? editingUser : u);
        setAllUsers(updatedList);
        setEditingUser(null);

        const csvString = stringifyCSV(updatedList);
        const success = await saveToGitHub(csvString);
        if (success) alert("Vendedor actualizado en Github.");
    };

    const handleDeleteSeller = async (id, name) => {
        if (!window.confirm(`¿Estás sumamente seguro de eliminar PERMANENTEMENTE a ${name} de users.csv de Github?`)) return;
        
        // Remove permanently from memory buffer
        const updatedList = allUsers.filter(u => u.id_usuario !== id);
        setAllUsers(updatedList);
        
        const csvString = stringifyCSV(updatedList);
        const success = await saveToGitHub(csvString);
        if (success) alert("Vendedor eliminado correctamente de la base de github.");
    };

    // Show active sellers conceptually
    const displaySellers = allUsers.filter(u => u.is_active === 'True' || u.is_active === 'true');

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Gestión de Vendedores (Sincronizado)</h2>
                    <p className="text-gray-500">Conectado en vivo con GitHub: `users.csv`</p>
                </div>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    disabled={isLoading}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold shadow-lg shadow-red-200 transition-all flex items-center gap-2"
                >
                    {isLoading ? "Cargando..." : "+ Nuevo Vendedor"}
                </button>
            </div>

            {isLoading ? (
                <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div></div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {displaySellers.map((user) => (
                        <div key={user.id_usuario} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col relative hover:shadow-md transition-shadow">
                            
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 bg-gradient-to-br from-red-100 to-red-50 rounded-full flex items-center justify-center text-xl text-red-600 font-bold shrink-0">
                                    {(user.nombre_corto || "U")[0]}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="font-bold text-gray-800 truncate" title={user.nombre_apellido}>{user.nombre_apellido}</h3>
                                    <p className="text-xs text-gray-400 font-mono truncate">{user.id_usuario}</p>
                                </div>
                            </div>

                            <div className="w-full bg-gray-50 rounded-lg p-3 space-y-2 border border-gray-100">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500 text-xs font-semibold uppercase">Contraseña</span>
                                    <span className="font-mono text-gray-700 bg-white px-2 py-0.5 rounded shadow-sm border border-gray-200">
                                        {user.pass}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500 text-xs font-semibold uppercase">Estado</span>
                                    <span className="text-green-600 text-xs font-bold bg-green-100 px-2 py-0.5 rounded-full">Activo</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500 text-xs font-semibold uppercase">Nom. Corto</span>
                                    <span className="text-gray-700 text-xs font-medium truncate ml-2">{user.nombre_corto}</span>
                                </div>
                            </div>

                            <div className="flex gap-2 w-full mt-4">
                                <button
                                    onClick={() => setEditingUser({...user})}
                                    className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 text-sm font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-1"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                    Editar Ficha
                                </button>
                                <button
                                    onClick={() => handleDeleteSeller(user.id_usuario, user.nombre_apellido)}
                                    className="w-10 flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                                    title="Eliminar permanentemente"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Edit Modal */}
            {editingUser && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[2000]">
                    <div className="bg-white p-6 rounded-2xl w-[400px] shadow-2xl">
                        <h3 className="text-xl font-bold mb-4">Editar Vendedor</h3>
                        <form onSubmit={handleUpdateSeller} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">ID (No Editable)</label>
                                <input type="text" value={editingUser.id_usuario} readOnly className="w-full border rounded-lg p-2 bg-gray-100 text-gray-500 cursor-not-allowed outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Nombre Corto</label>
                                <input type="text" value={editingUser.nombre_corto} onChange={e => setEditingUser({...editingUser, nombre_corto: e.target.value})} className="w-full border rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500" required />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Nombre Completo</label>
                                <input type="text" value={editingUser.nombre_apellido} onChange={e => setEditingUser({...editingUser, nombre_apellido: e.target.value})} className="w-full border rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500" required />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Contraseña</label>
                                <input type="text" value={editingUser.pass} onChange={e => setEditingUser({...editingUser, pass: e.target.value})} className="w-full border rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500" required />
                            </div>
                            <div className="flex justify-end gap-2 mt-4">
                                <button type="button" onClick={() => setEditingUser(null)} className="px-4 py-2 font-bold text-gray-500 hover:text-gray-700">Cancelar</button>
                                <button type="submit" className="px-4 py-2 font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700">Guardar Cambios</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[2000]">
                    <div className="bg-white p-6 rounded-2xl w-[400px] shadow-2xl">
                        <h3 className="text-xl font-bold mb-4">Crear Vendedor</h3>
                        <p className="text-sm text-gray-500 mb-4">Se creará con un ID único y la contraseña "123" por defecto directamente en Github.</p>
                        <form onSubmit={handleCreateSeller} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Nombre Corto (Ej. Juan Perez)</label>
                                <input type="text" value={newSeller.nombre_corto} onChange={e => setNewSeller({...newSeller, nombre_corto: e.target.value})} className="w-full border rounded-lg p-2 outline-none focus:ring-2 focus:ring-red-500" required />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Nombre Completo</label>
                                <input type="text" value={newSeller.nombre_apellido} onChange={e => setNewSeller({...newSeller, nombre_apellido: e.target.value})} className="w-full border rounded-lg p-2 outline-none focus:ring-2 focus:ring-red-500" required />
                            </div>
                            <div className="flex justify-end gap-2 mt-4">
                                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 font-bold text-gray-500 hover:text-gray-700">Cancelar</button>
                                <button type="submit" className="px-4 py-2 font-bold bg-red-600 text-white rounded-lg hover:bg-red-700">Autorizar y Crear</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;
