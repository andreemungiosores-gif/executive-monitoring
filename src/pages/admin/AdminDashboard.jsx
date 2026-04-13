import React from 'react';
import AdminMap from '../../components/AdminMap';

const AdminDashboard = () => {
    return (
        <div className="h-full w-full flex flex-col">
            {/* Header for this specific page */}
            <div className="bg-white p-6 border-b border-gray-200">
                <h2 className="text-2xl font-bold text-gray-800">Monitoreo en Vivo</h2>
                <p className="text-gray-500 text-sm">Ubicación en tiempo real de los ejecutivos activos.</p>
            </div>

            {/* The Map */}
            <div className="flex-1 relative">
                <AdminMap />
            </div>
        </div>
    );
};

export default AdminDashboard;
