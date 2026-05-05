"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export interface MockUser {
  id: string;
  email: string;
  displayName: string;
  avatar: string;
  profileImage: string | null;
  joinedAt: string;
  is2faEnabled?: boolean;
}

const API_URL = "http://localhost:8000";

interface AuthContextType {
  user: MockUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; requires2fa?: boolean; tempToken?: string }>;
  verify2faLogin: (tempToken: string, code: string) => Promise<boolean>;
  register: (email: string, password: string, displayName: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  updateProfile: (updates: Partial<MockUser>) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<MockUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${API_URL}/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        const userId = data.id.toString();
        setUser({
          id: userId,
          email: data.email,
          displayName: data.display_name || "Creator",
          avatar: "",
          profileImage: data.profile_image
            ? `${API_URL}/api/upload/profile-image/${userId}?v=${Date.now()}`
            : null,
          joinedAt: data.created_at || new Date().toISOString(),
          is2faEnabled: data.is_2fa_enabled ?? false,
        });
      } else {
        localStorage.removeItem("rf_token");
        setUser(null);
      }
    } catch (e) {
      console.error(e);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem("rf_token");
    if (token) {
      await fetchUser(token);
    }
  }, [fetchUser]);

  React.useEffect(() => {
    const token = localStorage.getItem("rf_token");
    if (token) {
      fetchUser(token);
    } else {
      setIsLoading(false);
    }
  }, [fetchUser]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const formData = new URLSearchParams();
      formData.append("username", email);
      formData.append("password", password);
      
      const res = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        
        // If 2FA is required, return the temp token
        if (data.requires_2fa) {
          return { ok: true, requires2fa: true, tempToken: data.temp_token };
        }
        
        // Normal login (no 2FA)
        localStorage.setItem("rf_token", data.access_token);
        const userId = data.user.id.toString();
        setUser({
          id: userId,
          email: data.user.email,
          displayName: data.user.display_name || "Creator",
          avatar: "",
          profileImage: data.user.profile_image
            ? `${API_URL}/api/upload/profile-image/${userId}?v=${Date.now()}`
            : null,
          joinedAt: data.user.created_at || new Date().toISOString(),
          is2faEnabled: data.user.is_2fa_enabled ?? false,
        });
        return { ok: true };
      } else {
        const errorData = await res.json().catch(() => null);
        return { ok: false, error: errorData?.detail || "Login failed" };
      }
    } catch (e) {
      console.error(e);
      return { ok: false };
    }
  }, []);

  const verify2faLogin = useCallback(async (tempToken: string, code: string) => {
    try {
      const res = await fetch(`${API_URL}/api/2fa/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ temp_token: tempToken, code }),
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("rf_token", data.access_token);
        const userId = data.user.id.toString();
        setUser({
          id: userId,
          email: data.user.email,
          displayName: data.user.display_name || "Creator",
          avatar: "",
          profileImage: data.user.profile_image
            ? `${API_URL}/api/upload/profile-image/${userId}?v=${Date.now()}`
            : null,
          joinedAt: data.user.created_at || new Date().toISOString(),
          is2faEnabled: data.user.is_2fa_enabled ?? false,
        });
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    try {
      const res = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, display_name: displayName }),
      });
      if (res.ok) {
        // Registration succeeds, but user must verify email before login.
        return { ok: true };
      } else {
        const errorData = await res.json().catch(() => null);
        return { ok: false, error: errorData?.detail || "Registration failed. Please try again." };
      }
    } catch (e) {
      console.error(e);
      return { ok: false, error: "Network error. Please check your connection." };
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem("rf_token");
  }, []);

  const updateProfile = useCallback((updates: Partial<MockUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, verify2faLogin, register, logout, updateProfile, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
