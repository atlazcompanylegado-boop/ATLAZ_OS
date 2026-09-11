"use client";

import { useActionState } from "react";
import { AtlasMark } from "@/components/brand/atlas-mark";
import { ParticleField } from "@/components/brand/particle-field";
import { OrbitLines } from "@/components/brand/orbit-lines";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { signInAction, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(signInAction, undefined);

  return (
    <div data-theme="institutional" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-0">
      <OrbitLines className="pointer-events-none absolute left-1/2 top-1/2 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 text-ink-3" />
      <ParticleField
        className="pointer-events-none absolute inset-0 h-full w-full text-ink-3"
        opacity={0.12}
        count={80}
      />

      <div className="relative z-10 w-full max-w-sm px-6">
        <div className="mb-10 flex flex-col items-center gap-4 text-center">
          <AtlasMark size={40} className="text-ink-1" />
          <div>
            <p className="font-display text-2xl tracking-wide text-ink-1">ATLΛZ OS</p>
            <p className="mt-1 text-sm text-ink-2">Sistema operacional da Atlaz Company</p>
          </div>
        </div>

        <form action={formAction} className="space-y-4 rounded-lg border border-border bg-surface-1 p-8 shadow-lg">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required placeholder="voce@atlazcompany.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>

          {state?.error ? <Alert variant="danger">{state.error}</Alert> : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Entrando..." : "Entrar"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-3">
          Acesso restrito à equipe Atlaz Company.
        </p>
      </div>
    </div>
  );
}
