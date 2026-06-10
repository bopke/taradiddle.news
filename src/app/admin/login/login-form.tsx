"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signInWithEmail(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const { error } = await authClient.signIn.email({ email, password });
      if (error) {
        setError(error.message ?? "Sign-in failed.");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  }

  async function signInWithDiscord() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const { error } = await authClient.signIn.social({
        provider: "discord",
        callbackURL: "/admin",
      });
      if (error) setError(error.message ?? "Discord sign-in failed.");
      // On success the browser navigates away to Discord.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discord sign-in failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>The newsroom of record for things that never happened.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={signInWithEmail} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" aria-live="assertive" aria-atomic="true" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={pending}
          onClick={signInWithDiscord}
        >
          Continue with Discord
        </Button>
      </CardContent>
    </Card>
  );
}
