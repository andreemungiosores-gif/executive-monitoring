import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login, loading } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const user = await login(username, password);
            if (user.role === 'admin') {
                navigate('/admin/dashboard');
            } else {
                navigate('/executive/home');
            }
        } catch (err) {
            setError('Usuario o contraseña incorrectos');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
            <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm">

                {/* Logo Section */}
                <div className="flex flex-col items-center mb-8">
                    <img
                        src="/medicaltech_logo.png"
                        alt="MedicalTech"
                        className="h-12 object-contain mb-2"
                    />
                </div>

                <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-gray-800">Hola, bienvenido</h2>
                    <p className="text-gray-500 text-sm mt-1">Ingresa tus credenciales para continuar</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <input
                                type="text"
                                placeholder="usuario"
                                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all shadow-sm text-gray-700"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>
                        {/* Sublabel style from design */}
                        <p className="text-xs text-gray-300 mt-1 ml-4 uppercase tracking-wider font-semibold">USUARIO</p>
                    </div>

                    <div>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <input
                                type="password"
                                placeholder="contraseña"
                                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all shadow-sm text-gray-700"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                        <p className="text-xs text-gray-300 mt-1 ml-4 uppercase tracking-wider font-semibold">CONTRASEÑA</p>
                    </div>

                    {error && (
                        <div className="text-red-500 text-xs text-center font-semibold bg-red-50 py-2 rounded-lg">
                            {error}
                        </div>
                    )}

                    <div className="flex justify-end">
                        <button type="button" className="text-red-400 text-sm font-medium hover:text-red-600 transition-colors">
                            ¿Olvidaste tu contraseña?
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-red-600 to-red-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-red-200 hover:shadow-red-300 hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-2"
                    >
                        {loading ? 'Validando...' : 'Iniciar Sesión'}
                        {!loading && (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                        )}
                    </button>
                </form>

                <div className="mt-8 text-center">
                    <div className="flex items-center justify-center gap-1 text-green-500 text-xs font-bold mb-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                        CONEXIÓN SEGURA ESTABLECIDA
                    </div>
                    <p className="text-gray-300 text-[10px]">
                        MedicalTech Field App v5.0 (RC)<br />
                        © 2026 Todos los derechos reservados
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
