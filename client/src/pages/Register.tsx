import { API_BASE_URL } from '../config';
import { useState } from 'react';

import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Lock, Mail, User } from 'lucide-react';
import { toast } from 'react-hot-toast';

const Register = () => {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios.post(`${API_BASE_URL}/api/auth/register`, {
                username,
                email,
                password,
            });
            toast.success("Registration successful! Please login.");
            navigate('/login');
        } catch (err: any) {
            console.error("Registration Error:", err);
            let errorMsg = 'Registration failed';

            if (err.response) {
                // The server responded with a status code that falls out of the range of 2xx
                if (err.response.data) {
                    if (err.response.data.message) {
                        errorMsg = err.response.data.message;
                    } else if (err.response.data.error) {
                        errorMsg = err.response.data.error; // e.g. "Bad Request"
                    }
                }
            } else if (err.request) {
                // The request was made but no response was received
                errorMsg = 'Network Error: No response from server. Is the backend running?';
            } else {
                // Something happened in setting up the request that triggered an Error
                errorMsg = err.message;
            }
            toast.error(errorMsg);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
            <div className="bg-slate-900 p-8 rounded-lg shadow-xl w-96 border border-slate-800">
                <h2 className="text-2xl font-bold mb-6 text-center text-white">Join CodeColab</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300">Username</label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <User className="h-5 w-5 text-slate-500" />
                            </div>
                            <input
                                type="text"
                                className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm bg-slate-950 border-slate-700 rounded-md p-2 border text-white placeholder-slate-500"
                                placeholder="Choose a username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300">Email</label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Mail className="h-5 w-5 text-slate-500" />
                            </div>
                            <input
                                type="email"
                                className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm bg-slate-950 border-slate-700 rounded-md p-2 border text-white placeholder-slate-500"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
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
                                placeholder="Create a password"
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
                        Create Account
                    </button>
                </form>
                <div className="mt-4 text-center">
                    <p className="text-sm text-slate-400">
                        Already have an account?{' '}
                        <Link to="/login" className="font-medium text-indigo-400 hover:text-indigo-300">
                            Sign In
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Register;
