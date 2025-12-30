"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Users,
} from "lucide-react";

import { backendFetch } from "@/lib/backendFetch";
import { getBackendUrl } from "@/lib/api-config";
import { getStoredAuthUser, type StoredAuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type PlatformRole = "platform_admin" | "user";
type NamespaceRole = "namespace_admin" | "editor" | "viewer";

type UserRecord = {
  id: string;
  username: string;
  email?: string | null;
  is_active: boolean;
  platform_role: PlatformRole;
  created_at: number;
  updated_at: number;
  last_login_at?: number | null;
};

type MembershipRecord = {
  namespace: string;
  role: NamespaceRole;
  created_at: number;
  updated_at: number;
};

type GroupRecord = {
  id: string;
  name: string;
  description?: string | null;
  created_at: number;
  updated_at: number;
};

type GroupMemberRecord = {
  group_id: string;
  user_id: string;
  username: string;
  email?: string | null;
  is_active: boolean;
  platform_role: PlatformRole;
  joined_at: number;
};

type GroupNamespaceAccessRecord = {
  group_id: string;
  namespace: string;
  role: NamespaceRole;
  created_at: number;
  updated_at: number;
};

type AuditLogEntry = {
  id: string;
  occurred_at: number;
  actor_user_id?: string | null;
  actor_username?: string | null;
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  namespace?: string | null;
  success: boolean;
  ip?: string | null;
  user_agent?: string | null;
  request_id?: string | null;
  detail?: Record<string, unknown> | null;
};

const PLATFORM_ROLES: Array<{ value: PlatformRole; label: string }> = [
  { value: "platform_admin", label: "Platform admin" },
  { value: "user", label: "User" },
];

const NAMESPACE_ROLES: Array<{ value: NamespaceRole; label: string }> = [
  { value: "namespace_admin", label: "Namespace admin" },
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Viewer" },
];

const formatTimestamp = (value?: number | null) => {
  if (!value) return "-";
  return new Date(value * 1000).toLocaleString();
};

const stringifyDetail = (detail?: Record<string, unknown> | null) => {
  if (!detail) return "-";
  try {
    return JSON.stringify(detail);
  } catch {
    return "[detail]";
  }
};

export default function AdminPage() {
  const router = useRouter();
  const { toast } = useToast();
  const backendUrl = useMemo(() => getBackendUrl(), []);

  const [authUser, setAuthUser] = useState<StoredAuthUser | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [pendingUsers, setPendingUsers] = useState<Record<string, boolean>>({});

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createUsername, setCreateUsername] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<PlatformRole>("user");
  const [createLoading, setCreateLoading] = useState(false);

  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const [membershipDialogOpen, setMembershipDialogOpen] = useState(false);
  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [membershipNamespace, setMembershipNamespace] = useState("");
  const [membershipRole, setMembershipRole] = useState<NamespaceRole>("viewer");
  const [membershipSaving, setMembershipSaving] = useState(false);

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditNamespace, setAuditNamespace] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditActorUserId, setAuditActorUserId] = useState("");

  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupFormName, setGroupFormName] = useState("");
  const [groupFormDescription, setGroupFormDescription] = useState("");
  const [groupFormLoading, setGroupFormLoading] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupRecord | null>(null);

  const [manageGroupOpen, setManageGroupOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<GroupRecord | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMemberRecord[]>([]);
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);
  const [groupMembersError, setGroupMembersError] = useState<string | null>(null);
  const [memberToAdd, setMemberToAdd] = useState("");
  const [memberSaving, setMemberSaving] = useState(false);

  const [groupAccess, setGroupAccess] = useState<GroupNamespaceAccessRecord[]>([]);
  const [groupAccessLoading, setGroupAccessLoading] = useState(false);
  const [groupAccessError, setGroupAccessError] = useState<string | null>(null);
  const [accessNamespace, setAccessNamespace] = useState("");
  const [accessRole, setAccessRole] = useState<NamespaceRole>("viewer");
  const [accessSaving, setAccessSaving] = useState(false);

  useEffect(() => {
    const stored = getStoredAuthUser();
    setAuthUser(stored);
    setCheckedAuth(true);
  }, []);

  const isAdmin = authUser?.platform_role === "platform_admin";

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const response = await backendFetch(`${backendUrl}/users?limit=200`);
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to load users");
      }
      const data = (await response.json()) as UserRecord[];
      setUsers(data);
    } catch (error) {
      setUsersError(
        error instanceof Error ? error.message : "Failed to load users"
      );
    } finally {
      setUsersLoading(false);
    }
  }, [backendUrl]);

  const loadAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const query = new URLSearchParams({ limit: "200" });
      if (auditNamespace.trim()) query.set("namespace", auditNamespace.trim());
      if (auditAction.trim()) query.set("action", auditAction.trim());
      if (auditActorUserId.trim())
        query.set("actor_user_id", auditActorUserId.trim());
      const response = await backendFetch(
        `${backendUrl}/audit-logs?${query.toString()}`
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to load audit logs");
      }
      const data = (await response.json()) as AuditLogEntry[];
      setAuditLogs(data);
    } catch (error) {
      setAuditError(
        error instanceof Error ? error.message : "Failed to load audit logs"
      );
    } finally {
      setAuditLoading(false);
    }
  }, [auditAction, auditActorUserId, auditNamespace, backendUrl]);

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    setGroupsError(null);
    try {
      const response = await backendFetch(`${backendUrl}/groups?limit=200`);
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to load groups");
      }
      const data = (await response.json()) as GroupRecord[];
      setGroups(data);
    } catch (error) {
      setGroupsError(
        error instanceof Error ? error.message : "Failed to load groups"
      );
    } finally {
      setGroupsLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadUsers();
    void loadAuditLogs();
    void loadGroups();
  }, [isAdmin, loadAuditLogs, loadGroups, loadUsers]);

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => {
      const email = user.email || "";
      return (
        user.username.toLowerCase().includes(query) ||
        email.toLowerCase().includes(query)
      );
    });
  }, [userSearch, users]);
  const activeAdminCount = useMemo(
    () =>
      users.filter(
        (user) => user.platform_role === "platform_admin" && user.is_active
      ).length,
    [users]
  );

  const filteredGroups = useMemo(() => {
    const query = groupSearch.trim().toLowerCase();
    if (!query) return groups;
    return groups.filter((group) => {
      const description = group.description || "";
      return (
        group.name.toLowerCase().includes(query) ||
        description.toLowerCase().includes(query)
      );
    });
  }, [groupSearch, groups]);

  const availableMemberOptions = useMemo(() => {
    const memberIds = new Set(groupMembers.map((member) => member.user_id));
    return users.filter((user) => !memberIds.has(user.id));
  }, [groupMembers, users]);

  const updateUser = async (userId: string, payload: Partial<UserRecord>) => {
    setPendingUsers((prev) => ({ ...prev, [userId]: true }));
    try {
      const response = await backendFetch(`${backendUrl}/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to update user");
      }
      const updated = (await response.json()) as UserRecord;
      setUsers((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      toast({ title: "User updated" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description:
          error instanceof Error ? error.message : "Failed to update user",
      });
    } finally {
      setPendingUsers((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleCreateUser = async () => {
    if (!createUsername.trim() || !createPassword.trim()) {
      toast({
        variant: "destructive",
        title: "Missing info",
        description: "Username and password are required.",
      });
      return;
    }
    if (createPassword.trim().length < 8) {
      toast({
        variant: "destructive",
        title: "Password too short",
        description: "Password must be at least 8 characters.",
      });
      return;
    }
    setCreateLoading(true);
    try {
      const response = await backendFetch(`${backendUrl}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: createUsername.trim(),
          password: createPassword.trim(),
          email: createEmail.trim() || null,
          platform_role: createRole,
        }),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to create user");
      }
      const created = (await response.json()) as UserRecord;
      setUsers((prev) => [created, ...prev]);
      setCreateDialogOpen(false);
      setCreateUsername("");
      setCreateEmail("");
      setCreatePassword("");
      setCreateRole("user");
      toast({ title: "User created" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Create failed",
        description:
          error instanceof Error ? error.message : "Failed to create user",
      });
    } finally {
      setCreateLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    if (resetPassword.trim().length < 8) {
      toast({
        variant: "destructive",
        title: "Password too short",
        description: "Password must be at least 8 characters.",
      });
      return;
    }
    setResetLoading(true);
    try {
      const response = await backendFetch(
        `${backendUrl}/users/${selectedUser.id}/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: resetPassword.trim() }),
        }
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to reset password");
      }
      setResetDialogOpen(false);
      setResetPassword("");
      toast({ title: "Password reset" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Reset failed",
        description:
          error instanceof Error ? error.message : "Failed to reset password",
      });
    } finally {
      setResetLoading(false);
    }
  };

  const loadMemberships = async (userId: string) => {
    setMembershipLoading(true);
    try {
      const response = await backendFetch(
        `${backendUrl}/users/${userId}/memberships`
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to load memberships");
      }
      const data = (await response.json()) as MembershipRecord[];
      setMemberships(data);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Load failed",
        description:
          error instanceof Error ? error.message : "Failed to load memberships",
      });
    } finally {
      setMembershipLoading(false);
    }
  };

  const handleOpenMemberships = async (user: UserRecord) => {
    setSelectedUser(user);
    setMembershipNamespace("");
    setMembershipRole("viewer");
    setMembershipDialogOpen(true);
    await loadMemberships(user.id);
  };

  const handleSaveMembership = async () => {
    if (!selectedUser) return;
    if (!membershipNamespace.trim()) {
      toast({
        variant: "destructive",
        title: "Namespace required",
      });
      return;
    }
    setMembershipSaving(true);
    try {
      const namespace = membershipNamespace.trim();
      const response = await backendFetch(
        `${backendUrl}/users/${selectedUser.id}/namespaces/${encodeURIComponent(
          namespace
        )}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: membershipRole }),
        }
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to update membership");
      }
      await loadMemberships(selectedUser.id);
      setMembershipNamespace("");
      setMembershipRole("viewer");
      toast({ title: "Access updated" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description:
          error instanceof Error ? error.message : "Failed to update membership",
      });
    } finally {
      setMembershipSaving(false);
    }
  };

  const handleOpenGroupForm = (group?: GroupRecord) => {
    if (group) {
      setEditingGroup(group);
      setGroupFormName(group.name);
      setGroupFormDescription(group.description || "");
    } else {
      setEditingGroup(null);
      setGroupFormName("");
      setGroupFormDescription("");
    }
    setGroupDialogOpen(true);
  };

  const handleSaveGroup = async () => {
    if (!groupFormName.trim()) {
      toast({
        variant: "destructive",
        title: "Group name required",
      });
      return;
    }
    setGroupFormLoading(true);
    try {
      const payload = {
        name: groupFormName.trim(),
        description: groupFormDescription.trim() || null,
      };
      const response = editingGroup
        ? await backendFetch(`${backendUrl}/groups/${editingGroup.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await backendFetch(`${backendUrl}/groups`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to save group");
      }
      const saved = (await response.json()) as GroupRecord;
      setGroups((prev) => {
        if (editingGroup) {
          return prev.map((group) => (group.id === saved.id ? saved : group));
        }
        return [saved, ...prev];
      });
      if (activeGroup?.id === saved.id) {
        setActiveGroup(saved);
      }
      setGroupDialogOpen(false);
      setEditingGroup(null);
      toast({ title: "Group saved" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description:
          error instanceof Error ? error.message : "Failed to save group",
      });
    } finally {
      setGroupFormLoading(false);
    }
  };

  const handleDeleteGroup = async (group: GroupRecord) => {
    const confirmed = window.confirm(
      `Delete group "${group.name}"? This will remove all memberships.`
    );
    if (!confirmed) {
      return;
    }
    try {
      const response = await backendFetch(`${backendUrl}/groups/${group.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to delete group");
      }
      setGroups((prev) => prev.filter((item) => item.id !== group.id));
      if (activeGroup?.id === group.id) {
        setActiveGroup(null);
        setManageGroupOpen(false);
      }
      toast({ title: "Group deleted" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description:
          error instanceof Error ? error.message : "Failed to delete group",
      });
    }
  };

  const loadGroupMembers = async (groupId: string) => {
    setGroupMembersLoading(true);
    setGroupMembersError(null);
    try {
      const response = await backendFetch(`${backendUrl}/groups/${groupId}/members`);
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to load group members");
      }
      const data = (await response.json()) as GroupMemberRecord[];
      setGroupMembers(data);
    } catch (error) {
      setGroupMembersError(
        error instanceof Error ? error.message : "Failed to load group members"
      );
    } finally {
      setGroupMembersLoading(false);
    }
  };

  const loadGroupAccess = async (groupId: string) => {
    setGroupAccessLoading(true);
    setGroupAccessError(null);
    try {
      const response = await backendFetch(
        `${backendUrl}/groups/${groupId}/namespace-access`
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to load group access");
      }
      const data = (await response.json()) as GroupNamespaceAccessRecord[];
      setGroupAccess(data);
    } catch (error) {
      setGroupAccessError(
        error instanceof Error ? error.message : "Failed to load group access"
      );
    } finally {
      setGroupAccessLoading(false);
    }
  };

  const handleOpenManageGroup = async (group: GroupRecord) => {
    setActiveGroup(group);
    setMemberToAdd("");
    setAccessNamespace("");
    setAccessRole("viewer");
    setManageGroupOpen(true);
    await Promise.all([loadGroupMembers(group.id), loadGroupAccess(group.id)]);
  };

  const handleAddMember = async () => {
    if (!activeGroup || !memberToAdd) return;
    setMemberSaving(true);
    try {
      const response = await backendFetch(
        `${backendUrl}/groups/${activeGroup.id}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: memberToAdd }),
        }
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to add member");
      }
      setMemberToAdd("");
      await loadGroupMembers(activeGroup.id);
      toast({ title: "Member added" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Add failed",
        description:
          error instanceof Error ? error.message : "Failed to add member",
      });
    } finally {
      setMemberSaving(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!activeGroup) return;
    try {
      const response = await backendFetch(
        `${backendUrl}/groups/${activeGroup.id}/members/${userId}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to remove member");
      }
      await loadGroupMembers(activeGroup.id);
      toast({ title: "Member removed" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Remove failed",
        description:
          error instanceof Error ? error.message : "Failed to remove member",
      });
    }
  };

  const handleSaveGroupAccess = async () => {
    if (!activeGroup) return;
    if (!accessNamespace.trim()) {
      toast({
        variant: "destructive",
        title: "Namespace required",
      });
      return;
    }
    setAccessSaving(true);
    try {
      const response = await backendFetch(
        `${backendUrl}/groups/${activeGroup.id}/namespace-access/${encodeURIComponent(
          accessNamespace.trim()
        )}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: accessRole }),
        }
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to save access");
      }
      setAccessNamespace("");
      setAccessRole("viewer");
      await loadGroupAccess(activeGroup.id);
      toast({ title: "Access saved" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description:
          error instanceof Error ? error.message : "Failed to save access",
      });
    } finally {
      setAccessSaving(false);
    }
  };

  const handleRemoveGroupAccess = async (namespace: string) => {
    if (!activeGroup) return;
    try {
      const response = await backendFetch(
        `${backendUrl}/groups/${activeGroup.id}/namespace-access/${encodeURIComponent(
          namespace
        )}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to remove access");
      }
      await loadGroupAccess(activeGroup.id);
      toast({ title: "Access removed" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Remove failed",
        description:
          error instanceof Error ? error.message : "Failed to remove access",
      });
    }
  };

  if (!checkedAuth) {
    return (
      <div className="px-6 py-6">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading admin console...
        </div>
      </div>
    );
  }

  if (checkedAuth && !isAdmin) {
    return (
      <div className="px-6 py-6">
        <div className="max-w-xl rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-red-300" />
            <h1 className="text-xl font-semibold text-slate-100">
              Access denied
            </h1>
          </div>
          <p className="mt-2 text-sm text-slate-300">
            This page is only available to platform administrators.
          </p>
          <Button
            className="mt-4"
            onClick={() => router.replace("/console/dashboard")}
          >
            Back to Console
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-slate-200" />
            <h1 className="text-2xl font-semibold text-white">Admin Console</h1>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Manage users, access controls, and audit logs.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="border-slate-700 text-slate-200 hover:bg-slate-800"
          onClick={() => {
            void loadUsers();
            void loadAuditLogs();
            void loadGroups();
          }}
          disabled={usersLoading || auditLoading || groupsLoading}
        >
          {usersLoading || auditLoading || groupsLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="bg-[#151921] border border-slate-800">
          <TabsTrigger
            value="users"
            className="data-[state=active]:bg-[#0f1116] data-[state=active]:text-white"
          >
            Users
          </TabsTrigger>
          <TabsTrigger
            value="audit"
            className="data-[state=active]:bg-[#0f1116] data-[state=active]:text-white"
          >
            Audit Logs
          </TabsTrigger>
          <TabsTrigger
            value="groups"
            className="data-[state=active]:bg-[#0f1116] data-[state=active]:text-white"
          >
            Groups
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Users className="h-4 w-4" />
              {users.length} users
            </div>
            <div className="flex items-center gap-3">
              <Input
                placeholder="Search username/email"
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                className="w-64 bg-[#0f1116] border-slate-800 text-slate-200"
              />
              <Button
                type="button"
                onClick={() => setCreateDialogOpen(true)}
                className="bg-blue-600 hover:bg-blue-500"
              >
                <Plus className="mr-2 h-4 w-4" />
                New User
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#151921]">
            {usersError ? (
              <div className="p-6 text-sm text-red-400">{usersError}</div>
            ) : usersLoading ? (
              <div className="p-6 flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading users...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">No users yet.</div>
            ) : (
              <Table>
                <TableHeader className="bg-[#11141c]">
                  <TableRow className="border-slate-800">
                    <TableHead className="text-slate-300">User</TableHead>
                    <TableHead className="text-slate-300">Platform Role</TableHead>
                    <TableHead className="text-slate-300">Status</TableHead>
                    <TableHead className="text-slate-300">Last Login</TableHead>
                    <TableHead className="text-slate-300">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => {
                    const isPending = Boolean(pendingUsers[user.id]);
                    const isSelf = authUser?.id === user.id;
                    const isActiveAdmin =
                      user.platform_role === "platform_admin" && user.is_active;
                    const isLastActiveAdmin = isActiveAdmin && activeAdminCount <= 1;
                    const isProtected = isSelf || isLastActiveAdmin;
                    return (
                      <TableRow key={user.id} className="border-slate-800">
                        <TableCell>
                          <div className="font-medium text-slate-100">{user.username}</div>
                          <div className="text-xs text-slate-400">
                            {user.email || "-"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={user.platform_role}
                            onValueChange={(value) =>
                              updateUser(user.id, {
                                platform_role: value as PlatformRole,
                              })
                            }
                            disabled={isPending || isProtected}
                          >
                            <SelectTrigger className="h-8 w-44 bg-[#0f1116] border-slate-800 text-slate-200">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#151921] border-slate-800 text-slate-100">
                              {PLATFORM_ROLES.map((role) => (
                                <SelectItem key={role.value} value={role.value}>
                                  {role.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Switch
                              checked={user.is_active}
                              onCheckedChange={(checked) =>
                                updateUser(user.id, { is_active: checked })
                              }
                              disabled={isPending || isProtected}
                            />
                            <span
                              className={cn(
                                "text-xs",
                                user.is_active ? "text-emerald-400" : "text-slate-500"
                              )}
                            >
                              {user.is_active ? "Active" : "Disabled"}
                            </span>
                            {isProtected ? (
                              <span className="text-[10px] text-slate-500">
                                Protected
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-300">
                          {formatTimestamp(user.last_login_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-slate-700 text-slate-200 hover:bg-slate-800"
                              onClick={() => handleOpenMemberships(user)}
                            >
                              Access
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-slate-700 text-slate-200 hover:bg-slate-800"
                              onClick={() => {
                                setSelectedUser(user);
                                setResetDialogOpen(true);
                              }}
                            >
                              Reset Password
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-[#151921] p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-slate-400">Namespace</Label>
                <Input
                  value={auditNamespace}
                  onChange={(event) => setAuditNamespace(event.target.value)}
                  placeholder="namespace"
                  className="w-48 bg-[#0f1116] border-slate-800 text-slate-200"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-slate-400">Action</Label>
                <Input
                  value={auditAction}
                  onChange={(event) => setAuditAction(event.target.value)}
                  placeholder="action"
                  className="w-48 bg-[#0f1116] border-slate-800 text-slate-200"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-slate-400">Actor User ID</Label>
                <Input
                  value={auditActorUserId}
                  onChange={(event) => setAuditActorUserId(event.target.value)}
                  placeholder="actor_user_id"
                  className="w-56 bg-[#0f1116] border-slate-800 text-slate-200"
                />
              </div>
              <Button
                type="button"
                onClick={() => void loadAuditLogs()}
                className="bg-blue-600 hover:bg-blue-500"
              >
                Apply Filters
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#151921]">
            {auditError ? (
              <div className="p-6 text-sm text-red-400">{auditError}</div>
            ) : auditLoading ? (
              <div className="p-6 flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading audit logs...
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">No audit logs found.</div>
            ) : (
              <Table>
                <TableHeader className="bg-[#11141c]">
                  <TableRow className="border-slate-800">
                    <TableHead className="text-slate-300">Time</TableHead>
                    <TableHead className="text-slate-300">Actor</TableHead>
                    <TableHead className="text-slate-300">Action</TableHead>
                    <TableHead className="text-slate-300">Resource</TableHead>
                    <TableHead className="text-slate-300">Namespace</TableHead>
                    <TableHead className="text-slate-300">Result</TableHead>
                    <TableHead className="text-slate-300">Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log) => (
                    <TableRow key={log.id} className="border-slate-800">
                      <TableCell className="text-sm text-slate-300">
                        {formatTimestamp(log.occurred_at)}
                      </TableCell>
                      <TableCell className="text-sm text-slate-300">
                        {log.actor_username || log.actor_user_id || "-"}
                      </TableCell>
                      <TableCell className="text-sm text-slate-200">
                        {log.action}
                      </TableCell>
                      <TableCell className="text-sm text-slate-400">
                        {log.resource_type || "-"}
                        {log.resource_id ? `:${log.resource_id}` : ""}
                      </TableCell>
                      <TableCell className="text-sm text-slate-400">
                        {log.namespace || "-"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                            log.success
                              ? "bg-emerald-500/10 text-emerald-300"
                              : "bg-red-500/10 text-red-300"
                          )}
                        >
                          {log.success ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <AlertTriangle className="h-3 w-3" />
                          )}
                          {log.success ? "Success" : "Failed"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-slate-400 max-w-[240px] truncate">
                        {stringifyDetail(log.detail)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="groups" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Shield className="h-4 w-4" />
              {groups.length} groups
            </div>
            <div className="flex items-center gap-3">
              <Input
                placeholder="Search group"
                value={groupSearch}
                onChange={(event) => setGroupSearch(event.target.value)}
                className="w-64 bg-[#0f1116] border-slate-800 text-slate-200"
              />
              <Button
                type="button"
                onClick={() => handleOpenGroupForm()}
                className="bg-blue-600 hover:bg-blue-500"
              >
                <Plus className="mr-2 h-4 w-4" />
                New Group
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#151921]">
            {groupsError ? (
              <div className="p-6 text-sm text-red-400">{groupsError}</div>
            ) : groupsLoading ? (
              <div className="p-6 flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading groups...
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">No groups yet.</div>
            ) : (
              <Table>
                <TableHeader className="bg-[#11141c]">
                  <TableRow className="border-slate-800">
                    <TableHead className="text-slate-300">Group</TableHead>
                    <TableHead className="text-slate-300">Description</TableHead>
                    <TableHead className="text-slate-300">Updated</TableHead>
                    <TableHead className="text-slate-300">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroups.map((group) => (
                    <TableRow key={group.id} className="border-slate-800">
                      <TableCell>
                        <div className="font-medium text-slate-100">{group.name}</div>
                        <div className="text-xs text-slate-500">{group.id}</div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-300">
                        {group.description || "-"}
                      </TableCell>
                      <TableCell className="text-sm text-slate-300">
                        {formatTimestamp(group.updated_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-700 text-slate-200 hover:bg-slate-800"
                            onClick={() => handleOpenManageGroup(group)}
                          >
                            Manage
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-700 text-slate-200 hover:bg-slate-800"
                            onClick={() => handleOpenGroupForm(group)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-500/40 text-red-300 hover:bg-red-500/10"
                            onClick={() => handleDeleteGroup(group)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="bg-[#151921] border border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-slate-100">
              Create User
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">Username</Label>
              <Input
                value={createUsername}
                onChange={(event) => setCreateUsername(event.target.value)}
                placeholder="username"
                className="bg-[#0f1116] border-slate-800 text-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">Email (optional)</Label>
              <Input
                value={createEmail}
                onChange={(event) => setCreateEmail(event.target.value)}
                placeholder="email"
                className="bg-[#0f1116] border-slate-800 text-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">Initial Password</Label>
              <Input
                value={createPassword}
                onChange={(event) => setCreatePassword(event.target.value)}
                placeholder="minimum 8 characters"
                type="password"
                className="bg-[#0f1116] border-slate-800 text-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">Platform Role</Label>
              <Select
                value={createRole}
                onValueChange={(value) => setCreateRole(value as PlatformRole)}
              >
                <SelectTrigger className="bg-[#0f1116] border-slate-800 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#151921] border-slate-800 text-slate-100">
                  {PLATFORM_ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              onClick={handleCreateUser}
              disabled={createLoading}
              className="w-full bg-blue-600 hover:bg-blue-500"
            >
              {createLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="bg-[#151921] border border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-slate-100">
              Reset Password
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-slate-300">
              Set a new password for{" "}
              <span className="font-semibold text-white">
                {selectedUser?.username}
              </span>
              .
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">New Password</Label>
              <Input
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                placeholder="minimum 8 characters"
                type="password"
                className="bg-[#0f1116] border-slate-800 text-slate-200"
              />
            </div>
            <Button
              type="button"
              onClick={handleResetPassword}
              disabled={resetLoading}
              className="w-full bg-blue-600 hover:bg-blue-500"
            >
              {resetLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="mr-2 h-4 w-4" />
              )}
              Reset
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={membershipDialogOpen} onOpenChange={setMembershipDialogOpen}>
        <DialogContent className="bg-[#151921] border border-slate-800 text-slate-100 max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-slate-100">
              Namespace Access
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-slate-300">
              User:{" "}
              <span className="font-semibold text-white">
                {selectedUser?.username}
              </span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#0f1116] p-4">
              <div className="text-xs text-slate-400 mb-2">Current Access</div>
              {membershipLoading ? (
                <div className="text-sm text-slate-400 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                </div>
              ) : memberships.length === 0 ? (
                <div className="text-sm text-slate-500">No access records.</div>
              ) : (
                <div className="space-y-2">
                  {memberships.map((item) => (
                    <div
                      key={item.namespace}
                      className="flex items-center justify-between text-sm text-slate-200"
                    >
                      <div>
                        <span className="font-medium text-white">
                          {item.namespace}
                        </span>
                        <span className="ml-2 text-xs text-slate-500">
                          {formatTimestamp(item.updated_at)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="text-xs text-blue-400 hover:text-blue-300"
                        onClick={() => {
                          setMembershipNamespace(item.namespace);
                          setMembershipRole(item.role);
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Namespace</Label>
                <Input
                  value={membershipNamespace}
                  onChange={(event) => setMembershipNamespace(event.target.value)}
                  placeholder="namespace"
                  className="bg-[#0f1116] border-slate-800 text-slate-200"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Role</Label>
                <Select
                  value={membershipRole}
                  onValueChange={(value) => setMembershipRole(value as NamespaceRole)}
                >
                  <SelectTrigger className="bg-[#0f1116] border-slate-800 text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#151921] border-slate-800 text-slate-100">
                    {NAMESPACE_ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              type="button"
              onClick={handleSaveMembership}
              disabled={membershipSaving}
              className="w-full bg-blue-600 hover:bg-blue-500"
            >
              {membershipSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Shield className="mr-2 h-4 w-4" />
              )}
              Save Access
            </Button>
            <div className="text-xs text-slate-500">
              Removing access is not supported yet.
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="bg-[#151921] border border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-slate-100">
              {editingGroup ? "Edit Group" : "Create Group"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">Group name</Label>
              <Input
                value={groupFormName}
                onChange={(event) => setGroupFormName(event.target.value)}
                placeholder="group name"
                className="bg-[#0f1116] border-slate-800 text-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">Description</Label>
              <Input
                value={groupFormDescription}
                onChange={(event) => setGroupFormDescription(event.target.value)}
                placeholder="optional description"
                className="bg-[#0f1116] border-slate-800 text-slate-200"
              />
            </div>
            <Button
              type="button"
              onClick={handleSaveGroup}
              disabled={groupFormLoading}
              className="w-full bg-blue-600 hover:bg-blue-500"
            >
              {groupFormLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {editingGroup ? "Save Changes" : "Create Group"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={manageGroupOpen}
        onOpenChange={(open) => {
          setManageGroupOpen(open);
          if (!open) {
            setActiveGroup(null);
          }
        }}
      >
        <DialogContent className="bg-[#151921] border border-slate-800 text-slate-100 max-w-[880px]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-slate-100">
              Manage Group
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-slate-300">
              Group:{" "}
              <span className="font-semibold text-white">
                {activeGroup?.name || "-"}
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="text-xs uppercase tracking-wider text-slate-400">
                  Members
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#0f1116] p-4">
                  {groupMembersError ? (
                    <div className="text-sm text-red-400">{groupMembersError}</div>
                  ) : groupMembersLoading ? (
                    <div className="text-sm text-slate-400 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading members...
                    </div>
                  ) : groupMembers.length === 0 ? (
                    <div className="text-sm text-slate-500">No members yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {groupMembers.map((member) => (
                        <div
                          key={member.user_id}
                          className="flex items-center justify-between text-sm text-slate-200"
                        >
                          <div>
                            <span className="font-medium text-white">
                              {member.username}
                            </span>
                            <span className="ml-2 text-xs text-slate-500">
                              {member.email || member.user_id}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="text-xs text-red-300 hover:text-red-200"
                            onClick={() => handleRemoveMember(member.user_id)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Select value={memberToAdd} onValueChange={setMemberToAdd}>
                    <SelectTrigger className="bg-[#0f1116] border-slate-800 text-slate-200">
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#151921] border-slate-800 text-slate-100">
                      {availableMemberOptions.length === 0 ? (
                        <SelectItem value="__none" disabled>
                          No available users
                        </SelectItem>
                      ) : (
                        availableMemberOptions.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.username}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    onClick={handleAddMember}
                    disabled={!memberToAdd || memberSaving}
                    className="bg-blue-600 hover:bg-blue-500"
                  >
                    {memberSaving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Add
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-xs uppercase tracking-wider text-slate-400">
                  Namespace Access
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#0f1116] p-4">
                  {groupAccessError ? (
                    <div className="text-sm text-red-400">{groupAccessError}</div>
                  ) : groupAccessLoading ? (
                    <div className="text-sm text-slate-400 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading access...
                    </div>
                  ) : groupAccess.length === 0 ? (
                    <div className="text-sm text-slate-500">No access entries.</div>
                  ) : (
                    <div className="space-y-2">
                      {groupAccess.map((entry) => (
                        <div
                          key={entry.namespace}
                          className="flex items-center justify-between text-sm text-slate-200"
                        >
                          <div>
                            <span className="font-medium text-white">
                              {entry.namespace}
                            </span>
                            <span className="ml-2 text-xs text-slate-500">
                              {entry.role}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="text-xs text-blue-400 hover:text-blue-300"
                              onClick={() => {
                                setAccessNamespace(entry.namespace);
                                setAccessRole(entry.role);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="text-xs text-red-300 hover:text-red-200"
                              onClick={() => handleRemoveGroupAccess(entry.namespace)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_160px] gap-2">
                  <Input
                    value={accessNamespace}
                    onChange={(event) => setAccessNamespace(event.target.value)}
                    placeholder="namespace"
                    className="bg-[#0f1116] border-slate-800 text-slate-200"
                  />
                  <Select
                    value={accessRole}
                    onValueChange={(value) => setAccessRole(value as NamespaceRole)}
                  >
                    <SelectTrigger className="bg-[#0f1116] border-slate-800 text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#151921] border-slate-800 text-slate-100">
                      {NAMESPACE_ROLES.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  onClick={handleSaveGroupAccess}
                  disabled={accessSaving}
                  className="bg-blue-600 hover:bg-blue-500"
                >
                  {accessSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Shield className="mr-2 h-4 w-4" />
                  )}
                  Save Access
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
