import { API_BASE_URL } from '../config';
import { useState } from 'react';

import { useNavigate, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Lock, User } from 'lucide-react';
import { toast } from 'react-hot-toast';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [shake, setShake] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const from = (location.state as any)?.from?.pathname || '/dashboard';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage('');
        setShake(false);
        try {
            const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
                username,
                password,
            });
            // Backend returns: { token, type, id, username, email }
            login(response.data.token, response.data);
            toast.success("Welcome back!");
            navigate(from, { replace: true });

        } catch (err: any) {
            console.error("Login error:", err);
            const message = err.response?.data?.message || err.message || 'Login failed';
            
            setErrorMessage(message);
            setShake(true);
            setTimeout(() => setShake(false), 500); // Remove shake class after animation completes
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
            <div className="bg-slate-900 p-8 rounded-lg shadow-xl w-96 border border-slate-800">
                <h2 className="text-2xl font-bold mb-6 text-center text-white">Login to CodeColab</h2>
                
                {errorMessage && (
                    <div className="mb-4 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-md text-sm text-center">
                        {errorMessage}
                    </div>
                )}
                
                <form onSubmit={handleSubmit} className={`space-y-4 ${shake ? 'animate-shake' : ''}`}>
                    <div>
                        <label className="block text-sm font-medium text-slate-300">Username</label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <User className="h-5 w-5 text-slate-500" />
                            </div>
                            <input
                                type="text"
                                className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm bg-slate-950 border-slate-700 rounded-md p-2 border text-white placeholder-slate-500"
                                placeholder="Enter username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300">Password</label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Lock className="h-5 w-5 text-slate-500" />
                            </div>
                            <input
                                type="password"
                                className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm bg-slate-950 border-slate-700 rounded-md p-2 border text-white placeholder-slate-500"
                                placeholder="Enter password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <button
                        type="submit"
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                    >
                        Sign In
                    </button>
                </form>
                <div className="mt-4 text-center">
                    <p className="text-sm text-slate-400">
                        Don't have an account?{' '}
                        <Link to="/register" className="font-medium text-indigo-400 hover:text-indigo-300">
                            Register
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
