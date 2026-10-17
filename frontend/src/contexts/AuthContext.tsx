"use client";

import { BACKEND_BASE_URL } from "@/lib/api-config";
import React, { createContext, useContext, useState, useCallback } from "react";
import { fetchWithTimeout } from "@/lib/http";

export interface MockUser {
  id: string;
  email: string;
  displayName: string;
  avatar: string;
  profileImage: string | null;
  joinedAt: string;
  is2faEnabled?: boolean;
  hasPassword?: boolean;
}

const API_URL = BACKEND_BASE_URL;

interface AuthContextType {
  user: MockUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authenticateMember: (email: string, password: string) => Promise<{
    ok: boolean;
    error?: string;
    requires2fa?: boolean;
    tempToken?: string;
  }>;
  manage2FA: (tempToken: string, code: string) => Promise<boolean>;
  registerGuest: (email: string, password: string, displayName: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  updateAccountProfile: (updates: Partial<MockUser>) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export const AuthProvider = ({ children, onSessionChange }: { children: React.ReactNode; onSessionChange?: () => void }) => {
  const [user, setUser] = useState<MockUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async (token: string) => {
    try {
      const res = await fetchWithTimeout(`${API_URL}/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (localStorage.getItem('rf_token') !== token) return;
        const userId = data.id.toString();
        setUser({
          id: userId,
          email: data.email,
          displayName: data.display_name || "Creator",
          avatar: "",
          profileImage: data.profile_image
            ? `${API_URL}/api/upload/profile-image/${userId}?v=${encodeURIComponent(data.profile_image)}`
            : null,
          joinedAt: data.created_at || new Date().toISOString(),
          is2faEnabled: data.is_2fa_enabled ?? false,
          hasPassword: data.has_password ?? true,
        });
      } else if (res.status === 401 && localStorage.getItem('rf_token') === token) {
        localStorage.removeItem("rf_token");
        setUser(null);
      }
    } catch (e) {
      console.error(e);
      if (localStorage.getItem('rf_token') === token) setUser(null);
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

  const authenticateMember = useCallback(async (email: string, password: string) => {
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
        onSessionChange?.();
        localStorage.setItem("rf_token", data.access_token);
        const userId = data.user.id.toString();
        setUser({
          id: userId,
          email: data.user.email,
          displayName: data.user.display_name || "Creator",
          avatar: "",
          profileImage: data.user.profile_image
            ? `${API_URL}/api/upload/profile-image/${userId}?v=${encodeURIComponent(data.user.profile_image)}`
            : null,
          joinedAt: data.user.created_at || new Date().toISOString(),
          is2faEnabled: data.user.is_2fa_enabled ?? false,
          hasPassword: data.user.has_password ?? true,
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
  }, [onSessionChange]);

  const manage2FA = useCallback(async (tempToken: string, code: string) => {
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
        onSessionChange?.();
        localStorage.setItem("rf_token", data.access_token);
        const userId = data.user.id.toString();
        setUser({
          id: userId,
          email: data.user.email,
          displayName: data.user.display_name || "Creator",
          avatar: "",
          profileImage: data.user.profile_image
            ? `${API_URL}/api/upload/profile-image/${userId}?v=${encodeURIComponent(data.user.profile_image)}`
            : null,
          joinedAt: data.user.created_at || new Date().toISOString(),
          is2faEnabled: data.user.is_2fa_enabled ?? false,
          hasPassword: data.user.has_password ?? true,
        });
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  }, [onSessionChange]);

  const registerGuest = useCallback(async (email: string, password: string, displayName: string) => {
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
    onSessionChange?.();
    setUser(null);
    localStorage.removeItem("rf_token");
  }, [onSessionChange]);

  const updateAccountProfile = useCallback((updates: Partial<MockUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      authenticateMember,
      manage2FA,
      registerGuest,
      logout,
      updateAccountProfile,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
