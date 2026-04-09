import { API_BASE_URL } from '../config';
import { createContext, useContext, useState, useEffect } from 'react';

import type { ReactNode } from 'react';
import axios from 'axios';

interface AuthContextType {
    user: any;
    token: string | null;
    login: (token: string, userData: any) => void;
    logout: () => void;
    register: (userData: any) => Promise<void>;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<any>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));

    useEffect(() => {
        const initAuth = async () => {
            if (token) {
                axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                try {
                    const response = await axios.get(`${API_BASE_URL}/api/auth/current`);
                    // Destructure intentionally unused to satisfy lint if it was needed, but omitting it now.
                    setUser(response.data); // Assuming response.data contains user info
                } catch (error) {
                    console.error("Failed to fetch user profile:", error);
                    // If token is invalid/expired, logout to clear state
                    logout();
                }
            } else {
                delete axios.defaults.headers.common['Authorization'];
                setUser(null);
            }
        };

        initAuth();

        // Add interceptor to handle 401s globally
        const interceptor = axios.interceptors.response.use(
            response => response,
            error => {
                if (error.response?.status === 401) {
                    logout();
                }
                return Promise.reject(error);
            }
        );

        return () => {
            axios.interceptors.response.eject(interceptor);
        };
    }, [token]);

    const login = (newToken: string, userData: any) => {
        localStorage.setItem('token', newToken);
        setToken(newToken);
        setUser(userData);
    };

    const logout = () => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
    };

    const register = async (_userData: any) => {
        // Registration logic is usually handled in component calling API directly, 
        // but context provides helper if needed. 
        // For now, allow direct API calls in components and use context only for state.
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, register, isAuthenticated: !!token }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
