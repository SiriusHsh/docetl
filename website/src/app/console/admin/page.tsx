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
  { value: "platform_admin", label: "平台管理员" },
  { value: "user", label: "用户" },
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
    return "【详情】";
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

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
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
        throw new Error(detail || "加载用户失败");
      }
      const data = (await response.json()) as UserRecord[];
      setUsers(data);
    } catch (error) {
      setUsersError(
        error instanceof Error ? error.message : "加载用户失败"
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
      if (auditAction.trim()) query.set("action", auditAction.trim());
      if (auditActorUserId.trim())
        query.set("actor_user_id", auditActorUserId.trim());
      const response = await backendFetch(
        `${backendUrl}/audit-logs?${query.toString()}`
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "加载审计日志失败");
      }
      const data = (await response.json()) as AuditLogEntry[];
      setAuditLogs(data);
    } catch (error) {
      setAuditError(
        error instanceof Error ? error.message : "加载审计日志失败"
      );
    } finally {
      setAuditLoading(false);
    }
  }, [auditAction, auditActorUserId, backendUrl]);

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    setGroupsError(null);
    try {
      const response = await backendFetch(`${backendUrl}/groups?limit=200`);
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "加载分组失败");
      }
      const data = (await response.json()) as GroupRecord[];
      setGroups(data);
    } catch (error) {
      setGroupsError(
        error instanceof Error ? error.message : "加载分组失败"
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
        throw new Error(detail || "更新用户失败");
      }
      const updated = (await response.json()) as UserRecord;
      setUsers((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      toast({ title: "用户已更新" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "更新失败",
        description:
          error instanceof Error ? error.message : "更新用户失败",
      });
    } finally {
      setPendingUsers((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleCreateUser = async () => {
    if (!createUsername.trim() || !createPassword.trim()) {
      toast({
        variant: "destructive",
        title: "缺少信息",
        description: "需要填写用户名与密码。",
      });
      return;
    }
    if (createPassword.trim().length < 8) {
      toast({
        variant: "destructive",
        title: "密码过短",
        description: "密码至少 8 位。",
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
        throw new Error(detail || "创建用户失败");
      }
      const created = (await response.json()) as UserRecord;
      setUsers((prev) => [created, ...prev]);
      setCreateDialogOpen(false);
      setCreateUsername("");
      setCreateEmail("");
      setCreatePassword("");
      setCreateRole("user");
      toast({ title: "用户已创建" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "创建失败",
        description:
          error instanceof Error ? error.message : "创建用户失败",
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
        title: "密码过短",
        description: "密码至少 8 位。",
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
        throw new Error(detail || "重置密码失败");
      }
      setResetDialogOpen(false);
      setResetPassword("");
      toast({ title: "密码已重置" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "重置失败",
        description:
          error instanceof Error ? error.message : "重置密码失败",
      });
    } finally {
      setResetLoading(false);
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
        title: "需要分组名称",
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
        throw new Error(detail || "保存分组失败");
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
      toast({ title: "分组已保存" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "保存失败",
        description:
          error instanceof Error ? error.message : "保存分组失败",
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
        throw new Error(detail || "删除分组失败");
      }
      setGroups((prev) => prev.filter((item) => item.id !== group.id));
      if (activeGroup?.id === group.id) {
        setActiveGroup(null);
        setManageGroupOpen(false);
      }
      toast({ title: "分组已删除" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "删除失败",
        description:
          error instanceof Error ? error.message : "删除分组失败",
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
        throw new Error(detail || "加载成员失败");
      }
      const data = (await response.json()) as GroupMemberRecord[];
      setGroupMembers(data);
    } catch (error) {
      setGroupMembersError(
        error instanceof Error ? error.message : "加载成员失败"
      );
    } finally {
      setGroupMembersLoading(false);
    }
  };

  const handleOpenManageGroup = async (group: GroupRecord) => {
    setActiveGroup(group);
    setMemberToAdd("");
    setManageGroupOpen(true);
    await loadGroupMembers(group.id);
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
        throw new Error(detail || "添加成员失败");
      }
      setMemberToAdd("");
      await loadGroupMembers(activeGroup.id);
      toast({ title: "成员已添加" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "添加失败",
        description:
          error instanceof Error ? error.message : "添加成员失败",
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
        throw new Error(detail || "移除成员失败");
      }
      await loadGroupMembers(activeGroup.id);
      toast({ title: "成员已移除" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "移除失败",
        description:
          error instanceof Error ? error.message : "移除成员失败",
      });
    }
  };

  if (!checkedAuth) {
    return (
      <div className="px-6 py-6">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> 正在加载管理后台...
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
            <h1 className="text-xl font-semibold text-slate-900">
              无权限访问
            </h1>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            仅平台管理员可访问该页面。
          </p>
          <Button
            className="mt-4"
            onClick={() => router.replace("/console/dashboard")}
          >
            返回控制台
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
            <Users className="h-6 w-6 text-slate-700" />
            <h1 className="text-2xl font-semibold text-slate-900">管理后台</h1>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            管理用户、分组与审计日志。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="border-slate-200 text-slate-700 hover:bg-slate-50"
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
          刷新
        </Button>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="bg-white border border-slate-200">
          <TabsTrigger
            value="users"
            className="data-[state=active]:bg-white data-[state=active]:text-slate-900"
          >
            用户
          </TabsTrigger>
          <TabsTrigger
            value="audit"
            className="data-[state=active]:bg-white data-[state=active]:text-slate-900"
          >
            审计日志
          </TabsTrigger>
          <TabsTrigger
            value="groups"
            className="data-[state=active]:bg-white data-[state=active]:text-slate-900"
          >
            分组
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Users className="h-4 w-4" />
              共 {users.length} 位用户
            </div>
            <div className="flex items-center gap-3">
              <Input
                placeholder="搜索用户名/邮箱"
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                className="w-64 bg-white border-slate-200 text-slate-700"
              />
              <Button
                type="button"
                onClick={() => setCreateDialogOpen(true)}
                className="bg-blue-600 hover:bg-blue-500"
              >
                <Plus className="mr-2 h-4 w-4" />
                新建用户
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white">
            {usersError ? (
              <div className="p-6 text-sm text-red-400">{usersError}</div>
            ) : usersLoading ? (
              <div className="p-6 flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> 正在加载用户...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">暂无用户。</div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="border-slate-200">
                    <TableHead className="text-slate-600">用户</TableHead>
                    <TableHead className="text-slate-600">平台角色</TableHead>
                    <TableHead className="text-slate-600">状态</TableHead>
                    <TableHead className="text-slate-600">最近登录</TableHead>
                    <TableHead className="text-slate-600">操作</TableHead>
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
                      <TableRow key={user.id} className="border-slate-200">
                        <TableCell>
                          <div className="font-medium text-slate-900">{user.username}</div>
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
                            <SelectTrigger className="h-8 w-44 bg-white border-slate-200 text-slate-700">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-white border-slate-200 text-slate-900">
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
                              {user.is_active ? "启用" : "停用"}
                            </span>
                            {isProtected ? (
                              <span className="text-[10px] text-slate-500">
                                受保护
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {formatTimestamp(user.last_login_at)}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-200 text-slate-700 hover:bg-slate-50"
                            onClick={() => {
                              setSelectedUser(user);
                              setResetDialogOpen(true);
                            }}
                          >
                            重置密码
                          </Button>
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
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-slate-400">动作</Label>
                <Input
                  value={auditAction}
                  onChange={(event) => setAuditAction(event.target.value)}
                  placeholder="动作"
                  className="w-48 bg-white border-slate-200 text-slate-700"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-slate-400">操作者 ID</Label>
                <Input
                  value={auditActorUserId}
                  onChange={(event) => setAuditActorUserId(event.target.value)}
                  placeholder="操作者 ID"
                  className="w-56 bg-white border-slate-200 text-slate-700"
                />
              </div>
              <Button
                type="button"
                onClick={() => void loadAuditLogs()}
                className="bg-blue-600 hover:bg-blue-500"
              >
                应用筛选
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white">
            {auditError ? (
              <div className="p-6 text-sm text-red-400">{auditError}</div>
            ) : auditLoading ? (
              <div className="p-6 flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> 正在加载审计日志...
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">暂无审计日志。</div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="border-slate-200">
                    <TableHead className="text-slate-600">时间</TableHead>
                    <TableHead className="text-slate-600">操作者</TableHead>
                    <TableHead className="text-slate-600">动作</TableHead>
                    <TableHead className="text-slate-600">资源</TableHead>
                    <TableHead className="text-slate-600">结果</TableHead>
                    <TableHead className="text-slate-600">详情</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log) => (
                    <TableRow key={log.id} className="border-slate-200">
                      <TableCell className="text-sm text-slate-600">
                        {formatTimestamp(log.occurred_at)}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {log.actor_username || log.actor_user_id || "-"}
                      </TableCell>
                      <TableCell className="text-sm text-slate-700">
                        {log.action}
                      </TableCell>
                      <TableCell className="text-sm text-slate-400">
                        {log.resource_type || "-"}
                        {log.resource_id ? `:${log.resource_id}` : ""}
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
                          {log.success ? "成功" : "失败"}
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
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Shield className="h-4 w-4" />
              共 {groups.length} 个分组
            </div>
            <div className="flex items-center gap-3">
              <Input
                placeholder="搜索分组"
                value={groupSearch}
                onChange={(event) => setGroupSearch(event.target.value)}
                className="w-64 bg-white border-slate-200 text-slate-700"
              />
              <Button
                type="button"
                onClick={() => handleOpenGroupForm()}
                className="bg-blue-600 hover:bg-blue-500"
              >
                <Plus className="mr-2 h-4 w-4" />
                新建分组
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white">
            {groupsError ? (
              <div className="p-6 text-sm text-red-400">{groupsError}</div>
            ) : groupsLoading ? (
              <div className="p-6 flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> 正在加载分组...
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">暂无分组。</div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="border-slate-200">
                    <TableHead className="text-slate-600">分组</TableHead>
                    <TableHead className="text-slate-600">描述</TableHead>
                    <TableHead className="text-slate-600">更新时间</TableHead>
                    <TableHead className="text-slate-600">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroups.map((group) => (
                    <TableRow key={group.id} className="border-slate-200">
                      <TableCell>
                        <div className="font-medium text-slate-900">{group.name}</div>
                        <div className="text-xs text-slate-500">{group.id}</div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {group.description || "-"}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {formatTimestamp(group.updated_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-200 text-slate-700 hover:bg-slate-50"
                            onClick={() => handleOpenManageGroup(group)}
                          >
                            管理
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-200 text-slate-700 hover:bg-slate-50"
                            onClick={() => handleOpenGroupForm(group)}
                          >
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-500/40 text-red-300 hover:bg-red-500/10"
                            onClick={() => handleDeleteGroup(group)}
                          >
                            删除
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
        <DialogContent className="bg-white border border-slate-200 text-slate-900">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-slate-900">
              创建用户
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">用户名</Label>
              <Input
                value={createUsername}
                onChange={(event) => setCreateUsername(event.target.value)}
                placeholder="用户名"
                className="bg-white border-slate-200 text-slate-700"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">邮箱（可选）</Label>
              <Input
                value={createEmail}
                onChange={(event) => setCreateEmail(event.target.value)}
                placeholder="邮箱"
                className="bg-white border-slate-200 text-slate-700"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">初始密码</Label>
              <Input
                value={createPassword}
                onChange={(event) => setCreatePassword(event.target.value)}
                placeholder="至少 8 位"
                type="password"
                className="bg-white border-slate-200 text-slate-700"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">平台角色</Label>
              <Select
                value={createRole}
                onValueChange={(value) => setCreateRole(value as PlatformRole)}
              >
                <SelectTrigger className="bg-white border-slate-200 text-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-900">
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
              创建
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="bg-white border border-slate-200 text-slate-900">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-slate-900">
              重置密码
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-slate-600">
              为{" "}
              <span className="font-semibold text-slate-900">
                {selectedUser?.username}
              </span>
              设置新密码。
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">新密码</Label>
              <Input
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                placeholder="至少 8 位"
                type="password"
                className="bg-white border-slate-200 text-slate-700"
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
              重置
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="bg-white border border-slate-200 text-slate-900">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-slate-900">
              {editingGroup ? "编辑分组" : "创建分组"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">分组名称</Label>
              <Input
                value={groupFormName}
                onChange={(event) => setGroupFormName(event.target.value)}
                placeholder="分组名称"
                className="bg-white border-slate-200 text-slate-700"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">描述</Label>
              <Input
                value={groupFormDescription}
                onChange={(event) => setGroupFormDescription(event.target.value)}
                placeholder="可选描述"
                className="bg-white border-slate-200 text-slate-700"
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
              {editingGroup ? "保存更改" : "创建分组"}
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
        <DialogContent className="bg-white border border-slate-200 text-slate-900 max-w-[880px]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-slate-900">
              管理分组
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-slate-600">
              分组：{" "}
              <span className="font-semibold text-slate-900">
                {activeGroup?.name || "-"}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-3">
                <div className="text-xs uppercase tracking-wider text-slate-400">
                  成员
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  {groupMembersError ? (
                    <div className="text-sm text-red-400">{groupMembersError}</div>
                  ) : groupMembersLoading ? (
                    <div className="text-sm text-slate-400 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> 正在加载成员...
                    </div>
                  ) : groupMembers.length === 0 ? (
                    <div className="text-sm text-slate-500">暂无成员。</div>
                  ) : (
                    <div className="space-y-2">
                      {groupMembers.map((member) => (
                        <div
                          key={member.user_id}
                          className="flex items-center justify-between text-sm text-slate-700"
                        >
                          <div>
                            <span className="font-medium text-slate-900">
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
                            移除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Select value={memberToAdd} onValueChange={setMemberToAdd}>
                    <SelectTrigger className="bg-white border-slate-200 text-slate-700">
                      <SelectValue placeholder="选择用户" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 text-slate-900">
                      {availableMemberOptions.length === 0 ? (
                        <SelectItem value="__none" disabled>
                          暂无可添加用户
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
                    添加
                  </Button>
                </div>
              </div>

            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
