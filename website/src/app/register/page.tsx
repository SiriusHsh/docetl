"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getBackendUrl } from "@/lib/api-config";
import {
  clearAuthSession,
  getAuthExpiresAt,
  getAuthToken,
  setAuthSession,
} from "@/lib/auth";
import * as localStorageKeys from "@/app/localStorageKeys";

type AuthResponse = {
  user: {
    id: string;
    username: string;
    email?: string | null;
    platform_role?: string;
  };
  token: string;
  expires_at: number;
};

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();

  const backendUrl = useMemo(() => getBackendUrl(), []);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    const expiresAt = getAuthExpiresAt();
    const now = Math.floor(Date.now() / 1000);
    if (!token) {
      return;
    }
    if (expiresAt !== null && expiresAt <= now) {
      clearAuthSession();
      return;
    }

    let cancelled = false;
    const verify = async () => {
      try {
        const meResponse = await fetch(`${backendUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (cancelled) return;
        if (meResponse.ok) {
          router.replace("/console/dashboard");
        } else {
          clearAuthSession();
        }
      } catch {
        if (!cancelled) {
          clearAuthSession();
        }
      }
    };

    verify();
    return () => {
      cancelled = true;
    };
  }, [backendUrl, router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "两次输入的密码不一致",
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${backendUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username,
          password,
          email: email ? email : null,
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `注册失败（${response.status}）`);
      }

      const data = (await response.json()) as AuthResponse;
      setAuthSession({
        token: data.token,
        expiresAt: data.expires_at,
        user: data.user,
      });

      Object.values(localStorageKeys).forEach((key) => {
        if (typeof key !== "string") return;
        if (key.startsWith("docetl_auth_")) return;
        window.localStorage.removeItem(key);
      });

      try {
        const meResponse = await fetch(`${backendUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${data.token}` },
          credentials: "include",
        });
        if (meResponse.ok) {
          const meData = (await meResponse.json()) as {
            memberships?: Array<{ namespace: string }>;
          };
          const defaultNamespace =
            meData.memberships?.find(
              (membership) => membership.namespace === "public_business"
            )?.namespace ?? meData.memberships?.[0]?.namespace;
          if (defaultNamespace) {
            window.localStorage.setItem(
              localStorageKeys.NAMESPACE_KEY,
              JSON.stringify(defaultNamespace)
            );
          }
        }
      } catch {
        // Ignore failures; user can still set namespace manually.
      }

      toast({ title: "账号已创建" });
      router.replace("/console/dashboard");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "注册失败",
        description: error instanceof Error ? error.message : "未知错误",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>创建账号</CardTitle>
          <CardDescription>注册新用户</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="3-64 位；字母/数字/ _ . -"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">邮箱（可选）</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 8 位"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入密码"
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex items-center justify-between gap-3">
            <Link href="/login" className="text-sm text-muted-foreground hover:underline">
              返回登录
            </Link>
            <Button type="submit" disabled={submitting}>
              {submitting ? "创建中..." : "创建账号"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
