"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export interface MockUser {
  id: string;
  email: string;
  displayName: string;
  avatar: string;
  plan: "free" | "pro" | "enterprise";
  joinedAt: string;
}

const API_URL = "http://localhost:8000";

interface AuthContextType {
  user: MockUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, displayName: string) => Promise<boolean>;
  logout: () => void;
  updateProfile: (updates: Partial<MockUser>) => void;
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
        setUser({
          id: data.id.toString(),
          email: data.email,
          displayName: data.display_name || "Creator",
          avatar: "",
          plan: data.plan || "free",
          joinedAt: new Date().toISOString(),
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
        localStorage.setItem("rf_token", data.access_token);
        setUser({
          id: data.user.id.toString(),
          email: data.user.email,
          displayName: data.user.display_name || "Creator",
          avatar: "",
          plan: data.user.plan || "free",
          joinedAt: new Date().toISOString(),
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
        const data = await res.json();
        localStorage.setItem("rf_token", data.access_token);
        setUser({
          id: data.user.id.toString(),
          email: data.user.email,
          displayName: data.user.display_name || "Creator",
          avatar: "",
          plan: data.user.plan || "free",
          joinedAt: new Date().toISOString(),
        });
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
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
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

