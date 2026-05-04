import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { API_URL, clearAuthToken, getAuthToken, setAuthToken } from "@/lib/api";

export type AppRole =
    | "alumni"
    | "president" | "vice_president" | "secretary" | "assistant_secretary"
    | "treasurer" | "assistant_treasurer" | "auditor" | "pio" | "appointed"
    | "chairman";

export interface Profile {
    id: string;
    name: string;
    email: string;
    student_id: string | null;
    course: string | null;
    batch: string | null;
    contact_number?: string | null;
    photo: string | null;
}

export interface User {
    id: string;
    email: string;
}

export interface AuthState {
    user: User | null;
    session: string | null;
    profile: Profile | null;
    role: AppRole | null;
    loading: boolean;
    isAdmin: boolean;
    isTracerCompleted: boolean;
}

interface AuthContextType extends AuthState {
    signIn: (email: string, password: string, rememberMe?: boolean) => Promise<{ error: string | null }>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    profile: null,
    role: null,
    loading: true,
    isAdmin: false,
    isTracerCompleted: false,
    signIn: async () => ({ error: null }),
    signOut: async () => { },
    refreshProfile: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<string | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [role, setRole] = useState<AppRole | null>(null);
    const [loading, setLoading] = useState(true);
    const [isTracerCompleted, setIsTracerCompleted] = useState(false);

    const clearAuthState = () => {
        setUser(null);
        setProfile(null);
        setRole(null);
        setSession(null);
        setIsTracerCompleted(false);
    };

    const fetchSession = async (token: string) => {
        try {
            const res = await fetch(`${API_URL}/auth/session`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!res.ok) throw new Error("Invalid session");

            const data = await res.json();

            setUser(data.user);
            setProfile(data.profile);
            setRole(data.role);
            setSession(token);
            setIsTracerCompleted(Boolean(data.isTracerCompleted));
        } catch (error) {
            clearAuthToken();
            clearAuthState();
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const token = getAuthToken();
        if (token) {
            fetchSession(token);
        } else {
            setLoading(false);
        }
    }, []);

    const signIn = async (email: string, password: string, rememberMe = false) => {
        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                return { error: data.error || "Login failed" };
            }

            setAuthToken(data.token, rememberMe);

            setSession(data.token);
            setUser(data.user);
            setProfile(data.profile || null);
            setRole(data.role || "alumni");
            setIsTracerCompleted(Boolean(data.isTracerCompleted));

            return { error: null };
        } catch (error: unknown) {
            return { error: error instanceof Error ? error.message : "Login failed" };
        }
    };

    const signOut = async () => {
        clearAuthToken();
        clearAuthState();
    };

    const refreshProfile = async () => {
        if (session) {
            setLoading(true);
            await fetchSession(session);
        }
    };

    const isAdmin =
        role !== null && role !== "alumni" && role !== "chairman";

    return (
        <AuthContext.Provider
            value={{
                user,
                session,
                profile,
                role,
                loading,
                isAdmin,
                isTracerCompleted,
                signIn,
                signOut,
                refreshProfile,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
