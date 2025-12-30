"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User, Layers } from "lucide-react";

import { backendFetch } from "@/lib/backendFetch";
import { clearAuthSession, getAuthToken, type StoredAuthUser } from "@/lib/auth";
import { getBackendUrl } from "@/lib/api-config";
import * as localStorageKeys from "@/app/localStorageKeys";
import {
  readNamespace,
  subscribeToNamespaceChanges,
  writeNamespace,
} from "@/lib/namespace";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type MembershipRecord = {
  namespace: string;
  role: string;
  created_at: number;
  updated_at: number;
};

export default function SettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const backendUrl = useMemo(() => getBackendUrl(), []);
  const [user, setUser] = useState<StoredAuthUser | null>(null);
  const [namespace, setNamespace] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [loadingMemberships, setLoadingMemberships] = useState(false);
  const [membershipError, setMembershipError] = useState<string | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(localStorageKeys.AUTH_USER_KEY);
    if (!raw) return;
    try {
      setUser(JSON.parse(raw));
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    setNamespace(readNamespace());
    return subscribeToNamespaceChanges((next) => {
      setNamespace(next);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadMemberships = async () => {
      setLoadingMemberships(true);
      setMembershipError(null);
      try {
        const response = await backendFetch(`${backendUrl}/auth/me`);
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(detail || "Failed to load memberships");
        }
        const data = (await response.json()) as {
          memberships?: MembershipRecord[];
        };
        if (cancelled) return;
        const list = data.memberships || [];
        setMemberships(list);
        if (!namespace && list.length > 0) {
          setNamespace(list[0].namespace);
          writeNamespace(list[0].namespace);
        }
      } catch (error) {
        if (!cancelled) {
          setMembershipError(
            error instanceof Error ? error.message : "Failed to load memberships"
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingMemberships(false);
        }
      }
    };
    void loadMemberships();
    return () => {
      cancelled = true;
    };
  }, [backendUrl]);

  const handleLogout = async () => {
    try {
      const token = getAuthToken();
      if (token) {
        await backendFetch(`${backendUrl}/auth/logout`, { method: "POST" });
      }
    } finally {
      clearAuthSession();
      router.replace("/login");
    }
  };

  return (
    <div className="px-6 py-6">
      <div className="flex items-center gap-3">
        <User className="h-6 w-6 text-slate-200" />
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
      </div>
      <p className="mt-2 text-sm text-slate-400">
        Manage your profile and session.
      </p>

      <div className="mt-6 rounded-2xl border border-white/5 bg-white/5 p-5">
        <div className="text-sm text-slate-300">Current User</div>
        <div className="mt-2 text-lg font-medium text-white">
          {user?.username || "Unknown user"}
        </div>
        {user?.email ? (
          <div className="mt-1 text-sm text-slate-400">{user.email}</div>
        ) : null}
        <button
          type="button"
          onClick={handleLogout}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:border-white/20 hover:bg-white/10"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-white/5 bg-white/5 p-5">
        <div className="flex items-center gap-3">
          <Layers className="h-5 w-5 text-slate-200" />
          <div>
            <div className="text-sm font-medium text-slate-200">
              Workspace Access
            </div>
            <div className="text-xs text-slate-500">
              Select the namespace you want to work in.
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Label className="text-xs text-slate-400">Namespace</Label>
          {membershipError ? (
            <div className="text-sm text-red-400">{membershipError}</div>
          ) : loadingMemberships ? (
            <div className="text-sm text-slate-400">Loading access...</div>
          ) : memberships.length === 0 ? (
            <div className="text-sm text-slate-500">
              No namespace access assigned yet.
            </div>
          ) : (
            <Select
              value={namespace || ""}
              onValueChange={(value) => {
                setNamespace(value);
                writeNamespace(value);
                toast({
                  title: "Namespace updated",
                  description: "Switched to the selected namespace.",
                });
              }}
            >
              <SelectTrigger className="bg-[#0f1116] border-slate-800 text-slate-200">
                <SelectValue placeholder="Select namespace" />
              </SelectTrigger>
              <SelectContent className="bg-[#151921] border-slate-800 text-slate-100">
                {memberships.map((membership) => (
                  <SelectItem
                    key={membership.namespace}
                    value={membership.namespace}
                  >
                    {membership.namespace} ({membership.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
    </div>
  );
}
