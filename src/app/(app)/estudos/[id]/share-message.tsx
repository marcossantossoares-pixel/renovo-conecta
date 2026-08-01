'use client';

import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

/**
 * A mensagem para o grupo de líderes — fim do Fluxo 7.
 *
 * **Sem integração com WhatsApp**, e a ausência é exigência do aceite da fase.
 * O texto é montado no servidor (`modules/studies/message.ts`) e chega pronto:
 * aqui só se copia.
 *
 * ⚠️ **O texto é mostrado num campo editável, e não escondido atrás do botão.**
 * Duas razões: quem envia em nome da igreja precisa ler antes o que vai enviar;
 * e se `navigator.clipboard` não existir — contexto sem HTTPS, navegador antigo
 * — ainda dá para selecionar e copiar à mão. Um botão que falha em silêncio faz
 * a pessoa colar o que tinha antes na área de transferência.
 */
export function ShareMessage({ mensagem }: { mensagem: string }) {
  const [estado, setEstado] = useState<'parado' | 'copiado' | 'falhou'>('parado');

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      setEstado('copiado');
    } catch {
      setEstado('falhou');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mensagem para o grupo de líderes</CardTitle>
        <CardDescription>
          Copie e cole no grupo. O sistema não envia nada por você.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {estado === 'copiado' && (
          <Alert tone="success">Mensagem copiada. Cole no grupo.</Alert>
        )}
        {estado === 'falhou' && (
          <Alert tone="warning">
            O navegador não deixou copiar sozinho. Selecione o texto abaixo e copie.
          </Alert>
        )}

        <Textarea
          label="Mensagem"
          hideLabel
          readOnly
          rows={12}
          value={mensagem}
          // Só leitura: editar aqui não mudaria o estudo, e daria a impressão de
          // que mudaria.
          onChange={() => undefined}
        />

        <div>
          <Button type="button" onClick={() => void copiar()}>
            Copiar mensagem
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
