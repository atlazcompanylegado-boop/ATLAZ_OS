"use client";

import * as React from "react";
import Image from "next/image";
import { useActionState } from "react";
import { Mail, Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";
import atlasLoginBg from "@/components/brand/atlas-login-bg.png";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { signInAction, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(signInAction, undefined);
  const [showPassword, setShowPassword] = React.useState(false);
  const [capsLockOn, setCapsLockOn] = React.useState(false);

  function handlePasswordKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (typeof e.getModifierState === "function") {
      setCapsLockOn(e.getModifierState("CapsLock"));
    }
  }

  return (
    <div data-theme="institutional" className="relative min-h-screen bg-surface-0">
      {/*
        A imagem oficial é o plano de fundo — literal, sem recorte, sem elemento
        redundante por cima (ela já traz o wordmark "ATLAZ OS"). `fixed` (não
        `absolute` num ancestral com `overflow-hidden`) para cobrir sempre
        exatamente o viewport, mesmo se o painel crescer (erro, Caps Lock) e a
        página passar a rolar — nunca esticando/cortando a arte. Ver
        docs/design-system.md §13.
      */}
      <div className="fixed inset-0">
        <Image
          src={atlasLoginBg}
          alt="ATLΛZ OS"
          fill
          priority
          sizes="100vw"
          className="object-contain object-top lg:object-cover lg:object-[center_15%]"
        />
      </div>

      {/*
        Composição deliberada (não centralização mecânica): no desktop o painel
        fica verticalmente centrado na metade vazia da arte (abaixo do wordmark
        embutido nela), deslocado para a direita — nunca colado na borda nem
        "solto" no rodapé. No mobile ele é a prioridade, empurrado para o fim do
        fluxo normal, abaixo da faixa da arte.
      */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-end px-6 pb-10 pt-6 lg:block">
        <div className="w-full max-w-sm lg:absolute lg:right-[9%] lg:top-[34vh]">
        <div className="atlaz-dark-scope surface-elevation-4 relative w-full overflow-hidden rounded-lg border p-8">
          {/* Highlight fino no topo — reforça a leitura de "peça de vidro". */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

          <div className="mb-6 space-y-1">
            <h1 className="font-display text-xl text-ink-1">Bem-vindo ao ATLΛZ OS</h1>
            <p className="text-sm text-ink-2">Acesse sua central de operações Atlaz.</p>
          </div>

          <form action={formAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="voce@atlazcompany.com"
                leftIcon={<Mail className="h-4 w-4" strokeWidth={1.5} />}
                error={!!state?.error}
                aria-describedby={state?.error ? "login-error" : undefined}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                onKeyDown={handlePasswordKey}
                onKeyUp={handlePasswordKey}
                leftIcon={<Lock className="h-4 w-4" strokeWidth={1.5} />}
                error={!!state?.error}
                aria-describedby={
                  [capsLockOn ? "caps-lock-hint" : null, state?.error ? "login-error" : null]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="text-ink-3 transition-colors duration-150 hover:text-ink-1 focus-visible:outline-none focus-visible:text-ink-1"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                    ) : (
                      <Eye className="h-4 w-4" strokeWidth={1.5} />
                    )}
                  </button>
                }
              />
              {capsLockOn ? (
                <p id="caps-lock-hint" className="text-xs text-warning">
                  Caps Lock ativado
                </p>
              ) : null}
            </div>

            {state?.error ? (
              <Alert id="login-error" variant="danger" title="Não foi possível entrar">
                {state.error}
              </Alert>
            ) : null}

            <Button type="submit" className="w-full" loading={pending}>
              {pending ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <div className="mt-6 flex items-start gap-2.5 border-t border-[var(--glass-border)] pt-5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" strokeWidth={1.5} />
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-ink-2">Acesso protegido</p>
              <p className="text-xs text-ink-3">
                Conexão HTTPS e autenticação gerenciada pelo Supabase Auth. Acesso restrito a
                usuários autorizados da Atlaz Company.
              </p>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
