"use client";

import Image from "next/image";
import { useActionState } from "react";
import atlasLoginBg from "@/components/brand/atlas-login-bg.png";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { signInAction, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(signInAction, undefined);

  return (
    <div data-theme="institutional" className="relative min-h-screen overflow-hidden bg-surface-0">
      {/*
        A imagem oficial (src/components/brand/atlas-login-bg.png) É o plano de
        fundo — literal, sem recorte, sem elemento redundante por cima (ela já
        traz o wordmark "ATLAZ OS"). `contain` abaixo de `lg` garante que nada
        dela é cortado em telas estreitas — como o fundo da página é o mesmo
        off-white da arte, a barra de "letterbox" é invisível. `cover` a partir
        de `lg` porque a proporção da imagem (~16:9) já é próxima da maioria das
        telas largas, então o corte é mínimo. O formulário fica ancorado na
        metade inferior, que é o espaço vazio da própria composição.
      */}
      <Image
        src={atlasLoginBg}
        alt="ATLΛZ OS"
        fill
        priority
        sizes="100vw"
        className="object-contain object-top lg:object-cover lg:object-[center_15%]"
      />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-end px-6 pb-12 pt-6 lg:items-end lg:pb-16 lg:pr-[10%]">
        <form
          action={formAction}
          className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface-1 p-8 shadow-lg"
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required placeholder="voce@atlazcompany.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>

          {state?.error ? <Alert variant="danger">{state.error}</Alert> : null}

          <Button type="submit" className="w-full" loading={pending}>
            Entrar
          </Button>
        </form>

        <p className="mt-6 max-w-sm text-center text-xs text-ink-3">
          Acesso restrito à equipe Atlaz Company.
        </p>
      </div>
    </div>
  );
}
