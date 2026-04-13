import React, { useState, useEffect } from 'react';
import { ref, onValue, set, remove } from 'firebase/database';
import { db } from '../../firebase';

const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Form State
    const [newUser, setNewUser] = useState({
        username: '',
        password: '',
        name: ''
    });

    useEffect(() => {
        const usersRef = ref(db, 'users');
        const unsubscribe = onValue(usersRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const userList = Object.entries(data).map(([key, val]) => ({
                    ...val,
                    id: key
                }));
                // Filter only executives for this view (or show all but highlight role)
                const executives = userList.filter(u => u.role === 'executive');
                setUsers(executives);
            } else {
                setUsers([]);
            }
        });
        return () => unsubscribe();
    }, []);

    const handleCreateUser = async (e) => {
        e.preventDefault();

        // Simple validation
        if (!newUser.username || !newUser.password || !newUser.name) return;

        // Clean username
        const cleanUsername = newUser.username.trim().replace(/[.#$\[\]]/g, "");

        try {
            await set(ref(db, `users/${cleanUsername}`), {
                username: cleanUsername,
                pass: newUser.password,
                name: newUser.name,
                role: 'executive',
                createdAt: Date.now()
            });

            setIsModalOpen(false);
            setNewUser({ username: '', password: '', name: '' });
            alert("Usuario creado exitosamente");
        } catch (error) {
            alert("Error al crear usuario: " + error.message);
        }
    };

    const handleDeleteUser = async (userId) => {
        if (confirm(`¿Estás seguro de eliminar a ${userId}?`)) {
            await remove(ref(db, `users/${userId}`));
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Gestión de Vendedores</h2>
                    <p className="text-gray-500">Administra las cuentas de acceso para los ejecutivos.</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold shadow-lg shadow-red-200 transition-all flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Nuevo Vendedor
                </button>
            </div>

            {/* Users Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {users.map((user) => (
                    <div key={user.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center relative hover:shadow-md transition-shadow">
                        <div className="w-16 h-16 bg-gradient-to-br from-red-100 to-red-50 rounded-full flex items-center justify-center text-2xl mb-3 text-red-600 font-bold">
                            {user.name.charAt(0)}
                        </div>
                        <h3 className="font-bold text-gray-800 text-lg">{user.name}</h3>
                        <p className="text-sm text-gray-400 font-mono mb-4">@{user.username}</p>

                        <div className="w-full bg-gray-50 rounded-lg p-3 mb-4">
                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                                <span>Contraseña:</span>
                                <span className="font-mono text-gray-700">{user.pass}</span>
                            </div>
                            <div className="flex justify-between text-xs text-gray-500">
                                <span>Estado:</span>
                                <span className="text-green-500 font-semibold">Activo</span>
                            </div>
                        </div>

                        <button
                            onClick={() => handleDeleteUser(user.id)}
                            className="text-red-400 hover:text-red-600 text-xs font-semibold flex items-center gap-1 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            Eliminar Usuario
                        </button>
                    </div>
                ))}

                {/* Empty State */}
                {users.length === 0 && (
                    <div className="col-span-full py-12 text-center text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
                        No hay vendedores registrados aún.
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-800">Registrar Nuevo Vendedor</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <form onSubmit={handleCreateUser} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Nombre Completo</label>
                                <input
                                    type="text"
                                    className="w-full p-3 bg-gray-50 rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-red-500 transition-all outline-none"
                                    placeholder="Ej. Juan Perez"
                                    value={newUser.name}
                                    onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Usuario (Login)</label>
                                <input
                                    type="text"
                                    className="w-full p-3 bg-gray-50 rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-red-500 transition-all outline-none"
                                    placeholder="Ej. jperez"
                                    value={newUser.username}
                                    onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Contraseña</label>
                                <input
                                    type="text"
                                    className="w-full p-3 bg-gray-50 rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-red-500 transition-all outline-none"
                                    placeholder="Contraseña de acceso"
                                    value={newUser.password}
                                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full bg-red-600 text-white font-bold py-3.5 rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200 mt-4"
                            >
                                Crear Usuario
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;
