import React from 'react';
import { Link } from 'react-router-dom';

const NotFound: React.FC = () => {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
            <h1 className="text-6xl font-bold mb-4">404</h1>
            <p className="text-xl mb-8">Oops! The page you're looking for doesn't exist.</p>
            <Link
                to="/dashboard"
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200"
            >
                Go Back to Dashboard
            </Link>
        </div>
    );
};

export default NotFound;
