"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Shield,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";

import { backendFetch } from "@/lib/backendFetch";
import { getBackendUrl } from "@/lib/api-config";
import { getStoredAuthUser, type StoredAuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
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
type ScenarioRole = "editor";

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

type ScenarioRecord = {
  namespace: string;
  display_name: string;
  description?: string | null;
  is_active: boolean;
  created_by_user_id?: string | null;
  created_at: number;
  updated_at: number;
};

type ScenarioUserAssignmentRecord = {
  user_id: string;
  username: string;
  email?: string | null;
  is_active: boolean;
  platform_role: PlatformRole;
  namespace: string;
  role: ScenarioRole;
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

  const [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(false);
  const [scenariosError, setScenariosError] = useState<string | null>(null);
  const [scenarioSearch, setScenarioSearch] = useState("");
  const [scenarioDialogOpen, setScenarioDialogOpen] = useState(false);
  const [editingScenario, setEditingScenario] = useState<ScenarioRecord | null>(null);
  const [scenarioFormName, setScenarioFormName] = useState("");
  const [scenarioFormDescription, setScenarioFormDescription] = useState("");
  const [scenarioFormActive, setScenarioFormActive] = useState(true);
  const [scenarioFormLoading, setScenarioFormLoading] = useState(false);

  const [manageScenarioOpen, setManageScenarioOpen] = useState(false);
  const [activeScenario, setActiveScenario] = useState<ScenarioRecord | null>(null);
  const [scenarioUsers, setScenarioUsers] = useState<ScenarioUserAssignmentRecord[]>([]);
  const [scenarioUsersLoading, setScenarioUsersLoading] = useState(false);
  const [scenarioAssignmentsError, setScenarioAssignmentsError] = useState<string | null>(null);
  const [scenarioUserToAssign, setScenarioUserToAssign] = useState("");
  const [scenarioAssignedSearch, setScenarioAssignedSearch] = useState("");
  const [scenarioAssignableSearch, setScenarioAssignableSearch] = useState("");
  const [scenarioAssignLoading, setScenarioAssignLoading] = useState(false);
  const [scenarioRemovingUsers, setScenarioRemovingUsers] = useState<Record<string, boolean>>({});


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

  const loadScenarios = useCallback(async () => {
    setScenariosLoading(true);
    setScenariosError(null);
    try {
      const response = await backendFetch(
        `${backendUrl}/scenarios?include_inactive=true&limit=500`
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "加载业务场景失败");
      }
      const data = (await response.json()) as ScenarioRecord[];
      setScenarios(data);
    } catch (error) {
      setScenariosError(
        error instanceof Error ? error.message : "加载业务场景失败"
      );
    } finally {
      setScenariosLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadUsers();
    void loadAuditLogs();
    void loadScenarios();
  }, [isAdmin, loadAuditLogs, loadScenarios, loadUsers]);

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

  const filteredScenarios = useMemo(() => {
    const query = scenarioSearch.trim().toLowerCase();
    if (!query) return scenarios;
    return scenarios.filter((scenario) => {
      const description = scenario.description || "";
      return (
        scenario.display_name.toLowerCase().includes(query) ||
        scenario.namespace.toLowerCase().includes(query) ||
        description.toLowerCase().includes(query)
      );
    });
  }, [scenarioSearch, scenarios]);

  const availableScenarioUsers = useMemo(() => {
    const assigned = new Set(scenarioUsers.map((item) => item.user_id));
    return users.filter((user) => !assigned.has(user.id));
  }, [scenarioUsers, users]);

  const filteredScenarioUsers = useMemo(() => {
    const query = scenarioAssignedSearch.trim().toLowerCase();
    if (!query) return scenarioUsers;
    return scenarioUsers.filter((member) => {
      const email = member.email || "";
      return (
        member.username.toLowerCase().includes(query) ||
        email.toLowerCase().includes(query)
      );
    });
  }, [scenarioAssignedSearch, scenarioUsers]);

  const filteredAvailableScenarioUsers = useMemo(() => {
    const query = scenarioAssignableSearch.trim().toLowerCase();
    if (!query) return availableScenarioUsers;
    return availableScenarioUsers.filter((user) => {
      const email = user.email || "";
      return (
        user.username.toLowerCase().includes(query) ||
        email.toLowerCase().includes(query)
      );
    });
  }, [availableScenarioUsers, scenarioAssignableSearch]);

  const selectableScenarioUsers = useMemo(() => {
    if (!scenarioUserToAssign) return filteredAvailableScenarioUsers;
    const hasSelectedInList = filteredAvailableScenarioUsers.some(
      (user) => user.id === scenarioUserToAssign
    );
    if (hasSelectedInList) return filteredAvailableScenarioUsers;
    const selectedUser = availableScenarioUsers.find(
      (user) => user.id === scenarioUserToAssign
    );
    return selectedUser
      ? [selectedUser, ...filteredAvailableScenarioUsers]
      : filteredAvailableScenarioUsers;
  }, [availableScenarioUsers, filteredAvailableScenarioUsers, scenarioUserToAssign]);

  useEffect(() => {
    if (!scenarioUserToAssign) return;
    const stillAvailable = availableScenarioUsers.some(
      (user) => user.id === scenarioUserToAssign
    );
    if (!stillAvailable) {
      setScenarioUserToAssign("");
    }
  }, [availableScenarioUsers, scenarioUserToAssign]);

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

  const handleOpenScenarioForm = (scenario?: ScenarioRecord) => {
    if (scenario) {
      setEditingScenario(scenario);
      setScenarioFormName(scenario.display_name);
      setScenarioFormDescription(scenario.description || "");
      setScenarioFormActive(scenario.is_active);
    } else {
      setEditingScenario(null);
      setScenarioFormName("");
      setScenarioFormDescription("");
      setScenarioFormActive(true);
    }
    setScenarioDialogOpen(true);
  };

  const handleSaveScenario = async () => {
    if (!scenarioFormName.trim()) {
      toast({
        variant: "destructive",
        title: "需要业务场景名称",
      });
      return;
    }
    setScenarioFormLoading(true);
    try {
      const payload = editingScenario
        ? {
            display_name: scenarioFormName.trim(),
            description: scenarioFormDescription.trim() || null,
            is_active: scenarioFormActive,
          }
        : {
            display_name: scenarioFormName.trim(),
            description: scenarioFormDescription.trim() || null,
          };

      const response = editingScenario
        ? await backendFetch(`${backendUrl}/scenarios/${editingScenario.namespace}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await backendFetch(`${backendUrl}/scenarios`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "保存业务场景失败");
      }
      setScenarioDialogOpen(false);
      setEditingScenario(null);
      await loadScenarios();
      toast({ title: "业务场景已保存" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "保存失败",
        description: error instanceof Error ? error.message : "保存业务场景失败",
      });
    } finally {
      setScenarioFormLoading(false);
    }
  };

  const loadScenarioUsers = async (namespace: string) => {
    setScenarioUsersLoading(true);
    setScenarioAssignmentsError(null);
    try {
      const response = await backendFetch(`${backendUrl}/scenarios/${namespace}/users`);
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "加载业务场景用户失败");
      }
      const data = (await response.json()) as ScenarioUserAssignmentRecord[];
      setScenarioUsers(data);
    } catch (error) {
      setScenarioAssignmentsError(
        error instanceof Error ? error.message : "加载业务场景用户失败"
      );
    } finally {
      setScenarioUsersLoading(false);
    }
  };

  const handleOpenManageScenario = async (scenario: ScenarioRecord) => {
    setActiveScenario(scenario);
    setManageScenarioOpen(true);
    setScenarioUserToAssign("");
    setScenarioAssignedSearch("");
    setScenarioAssignableSearch("");
    setScenarioRemovingUsers({});
    await loadScenarioUsers(scenario.namespace);
  };

  const handleAssignScenarioUser = async () => {
    if (!activeScenario || !scenarioUserToAssign) return;
    setScenarioAssignLoading(true);
    try {
      const response = await backendFetch(
        `${backendUrl}/scenarios/${activeScenario.namespace}/users/${scenarioUserToAssign}`,
        {
          method: "PUT",
        }
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "分配用户失败");
      }
      setScenarioUserToAssign("");
      setScenarioAssignableSearch("");
      await loadScenarioUsers(activeScenario.namespace);
      toast({ title: "用户已分配到业务场景" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "分配失败",
        description: error instanceof Error ? error.message : "分配用户失败",
      });
    } finally {
      setScenarioAssignLoading(false);
    }
  };

  const handleRemoveScenarioUser = async (userId: string) => {
    if (!activeScenario) return;
    setScenarioRemovingUsers((prev) => ({ ...prev, [userId]: true }));
    try {
      const response = await backendFetch(
        `${backendUrl}/scenarios/${activeScenario.namespace}/users/${userId}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "移除用户失败");
      }
      await loadScenarioUsers(activeScenario.namespace);
      toast({ title: "用户已移除" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "移除失败",
        description: error instanceof Error ? error.message : "移除用户失败",
      });
    } finally {
      setScenarioRemovingUsers((prev) => ({ ...prev, [userId]: false }));
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
            管理用户、业务场景与审计日志。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="border-slate-200 text-slate-700 hover:bg-slate-50"
          onClick={() => {
            void loadUsers();
            void loadAuditLogs();
            void loadScenarios();
          }}
          disabled={usersLoading || auditLoading || scenariosLoading}
        >
          {usersLoading || auditLoading || scenariosLoading ? (
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
            value="scenarios"
            className="data-[state=active]:bg-white data-[state=active]:text-slate-900"
          >
            业务场景
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

        <TabsContent value="scenarios" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Shield className="h-4 w-4" />
              共 {scenarios.length} 个业务场景
            </div>
            <div className="flex items-center gap-3">
              <Input
                placeholder="搜索业务场景"
                value={scenarioSearch}
                onChange={(event) => setScenarioSearch(event.target.value)}
                className="w-64 bg-white border-slate-200 text-slate-700"
              />
              <Button
                type="button"
                onClick={() => handleOpenScenarioForm()}
                className="bg-blue-600 hover:bg-blue-500"
              >
                <Plus className="mr-2 h-4 w-4" />
                新建业务场景
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white">
            {scenariosError ? (
              <div className="p-6 text-sm text-red-400">{scenariosError}</div>
            ) : scenariosLoading ? (
              <div className="p-6 flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> 正在加载业务场景...
              </div>
            ) : filteredScenarios.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">暂无业务场景。</div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="border-slate-200">
                    <TableHead className="text-slate-600">场景名称</TableHead>
                    <TableHead className="text-slate-600">场景标识</TableHead>
                    <TableHead className="text-slate-600">状态</TableHead>
                    <TableHead className="text-slate-600">更新时间</TableHead>
                    <TableHead className="text-slate-600">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredScenarios.map((scenario) => (
                    <TableRow key={scenario.namespace} className="border-slate-200">
                      <TableCell>
                        <div className="font-medium text-slate-900">
                          {scenario.display_name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {scenario.description || "-"}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 font-mono">
                        {scenario.namespace}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {scenario.is_active ? "启用" : "停用"}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {formatTimestamp(scenario.updated_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-200 text-slate-700 hover:bg-slate-50"
                            onClick={() => handleOpenManageScenario(scenario)}
                          >
                            授权管理
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-200 text-slate-700 hover:bg-slate-50"
                            onClick={() => handleOpenScenarioForm(scenario)}
                          >
                            编辑
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

      <Dialog open={scenarioDialogOpen} onOpenChange={setScenarioDialogOpen}>
        <DialogContent className="bg-white border border-slate-200 text-slate-900">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-slate-900">
              {editingScenario ? "编辑业务场景" : "创建业务场景"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">业务场景名称</Label>
              <Input
                value={scenarioFormName}
                onChange={(event) => setScenarioFormName(event.target.value)}
                placeholder="例如：可信数字人"
                className="bg-white border-slate-200 text-slate-700"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">描述</Label>
              <Input
                value={scenarioFormDescription}
                onChange={(event) => setScenarioFormDescription(event.target.value)}
                placeholder="可选描述"
                className="bg-white border-slate-200 text-slate-700"
              />
            </div>
            {editingScenario ? (
              <div className="flex items-center gap-3">
                <Switch
                  checked={scenarioFormActive}
                  onCheckedChange={setScenarioFormActive}
                />
                <span className="text-sm text-slate-700">启用业务场景</span>
              </div>
            ) : null}
            <Button
              type="button"
              onClick={handleSaveScenario}
              disabled={scenarioFormLoading}
              className="w-full bg-blue-600 hover:bg-blue-500"
            >
              {scenarioFormLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {editingScenario ? "保存更改" : "创建业务场景"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={manageScenarioOpen}
        onOpenChange={(open) => {
          setManageScenarioOpen(open);
          if (!open) {
            setActiveScenario(null);
            setScenarioUserToAssign("");
            setScenarioAssignedSearch("");
            setScenarioAssignableSearch("");
            setScenarioRemovingUsers({});
          }
        }}
      >
        <DialogContent className="max-w-4xl overflow-hidden border border-slate-200 bg-white p-0 text-slate-900">
          <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-blue-50/60 px-6 py-5">
            <DialogHeader className="space-y-3 text-left">
              <DialogTitle className="text-lg font-semibold text-slate-900">
                业务场景授权管理
              </DialogTitle>
              <p className="text-sm text-slate-600">
                为业务场景配置可访问用户，支持快速查找、批量识别状态并安全移除授权。
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-slate-300 bg-white/80 text-slate-700"
                >
                  场景：{activeScenario?.display_name || "-"}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-slate-300 bg-white/80 font-mono text-slate-600"
                >
                  {activeScenario?.namespace || "未选择"}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-blue-200 bg-blue-50 text-blue-700"
                >
                  已授权 {scenarioUsers.length} 人
                </Badge>
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-emerald-700"
                >
                  可添加 {availableScenarioUsers.length} 人
                </Badge>
              </div>
            </DialogHeader>
          </div>

          <div className="space-y-5 px-6 py-6">
            {scenarioAssignmentsError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {scenarioAssignmentsError}
              </div>
            ) : null}

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">已授权用户</h3>
                  <span className="text-xs text-slate-500">
                    {filteredScenarioUsers.length} / {scenarioUsers.length}
                  </span>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={scenarioAssignedSearch}
                    onChange={(event) => setScenarioAssignedSearch(event.target.value)}
                    placeholder="搜索已授权用户（用户名/邮箱）"
                    className="border-slate-200 bg-white pl-9 text-slate-700"
                  />
                </div>

                {scenarioUsersLoading ? (
                  <div className="flex min-h-[240px] items-center justify-center text-sm text-slate-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    正在加载用户授权...
                  </div>
                ) : scenarioUsers.length === 0 ? (
                  <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center">
                    <Users className="h-8 w-8 text-slate-300" />
                    <p className="mt-3 text-sm font-medium text-slate-700">当前还没有授权用户</p>
                    <p className="mt-1 text-xs text-slate-500">
                      右侧选择用户后点击“添加到场景”，即可完成授权。
                    </p>
                  </div>
                ) : filteredScenarioUsers.length === 0 ? (
                  <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 text-sm text-slate-500">
                    未找到匹配的用户。
                  </div>
                ) : (
                  <ScrollArea className="h-[300px] pr-2">
                    <div className="space-y-2">
                      {filteredScenarioUsers.map((member) => {
                        const isRemoving = Boolean(scenarioRemovingUsers[member.user_id]);
                        return (
                          <div
                            key={member.user_id}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-3 transition hover:border-slate-300 hover:shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-sm font-semibold text-slate-900">
                                    {member.username}
                                  </p>
                                  <Badge
                                    variant="outline"
                                    className="border-slate-300 bg-slate-50 text-slate-600"
                                  >
                                    编辑者
                                  </Badge>
                                  {member.platform_role === "platform_admin" ? (
                                    <Badge
                                      variant="outline"
                                      className="border-indigo-200 bg-indigo-50 text-indigo-700"
                                    >
                                      平台管理员
                                    </Badge>
                                  ) : null}
                                  {!member.is_active ? (
                                    <Badge
                                      variant="outline"
                                      className="border-amber-200 bg-amber-50 text-amber-700"
                                    >
                                      已停用
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                                  <Mail className="h-3.5 w-3.5" />
                                  <span className="truncate">{member.email || "无邮箱信息"}</span>
                                </div>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isRemoving || scenarioUsersLoading}
                                onClick={() => handleRemoveScenarioUser(member.user_id)}
                                className="border-red-200 bg-white text-red-600 hover:bg-red-50 hover:text-red-700"
                              >
                                {isRemoving ? (
                                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <UserMinus className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                移除
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>

              <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">添加授权</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    仅显示未授权到该场景的用户。支持按用户名或邮箱搜索。
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">搜索候选用户</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={scenarioAssignableSearch}
                      onChange={(event) => setScenarioAssignableSearch(event.target.value)}
                      placeholder="输入用户名或邮箱"
                      className="border-slate-200 bg-white pl-9 text-slate-700"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">选择用户</Label>
                  <Select value={scenarioUserToAssign} onValueChange={setScenarioUserToAssign}>
                    <SelectTrigger className="border-slate-200 bg-white text-slate-700">
                      <SelectValue placeholder="请选择要授权的用户" />
                    </SelectTrigger>
                    <SelectContent className="border-slate-200 bg-white text-slate-900">
                      {selectableScenarioUsers.length === 0 ? (
                        <SelectItem value="__none_user" disabled>
                          暂无匹配用户
                        </SelectItem>
                      ) : (
                        selectableScenarioUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate">{user.username}</span>
                              <span className="truncate text-xs text-slate-500">
                                {user.email || "无邮箱信息"}
                              </span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="button"
                  onClick={handleAssignScenarioUser}
                  disabled={!scenarioUserToAssign || scenarioAssignLoading}
                  className="w-full bg-blue-600 hover:bg-blue-500"
                >
                  {scenarioAssignLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="mr-2 h-4 w-4" />
                  )}
                  添加到场景
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
