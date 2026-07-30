'use client';

import { type ReactNode, useCallback, useEffect, useId, useRef } from 'react';

import { cn } from '@/lib/cn';
import { Button } from './button';
import { CloseIcon } from './icons';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** Impede fechar por Esc ou clique fora. Use só em operação em andamento. */
  dismissible?: boolean;
  className?: string;
}

/**
 * Janela modal sobre o elemento `<dialog>` nativo.
 *
 * O nativo entrega de graça o que uma implementação própria erraria: prender o
 * foco dentro da janela, devolver o foco ao elemento de origem ao fechar,
 * fechar com Esc e tornar inerte o conteúdo atrás. Reimplementar isso com
 * `div` daria mais código e menos acessibilidade.
 *
 * O único ajuste necessário é fechar ao clicar no fundo, que o nativo não faz.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // O `cancel` cobre a tecla Esc, que o navegador trata nativamente.
  const handleCancel = useCallback(
    (event: React.SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault();
      if (dismissible) onClose();
    },
    [dismissible, onClose],
  );

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      if (!dismissible) return;

      // O alvo só é o próprio `<dialog>` quando o clique cai no fundo:
      // cliques no conteúdo têm o painel interno como alvo.
      if (event.target === dialogRef.current) onClose();
    },
    [dismissible, onClose],
  );

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        'm-auto w-[calc(100vw-2rem)] max-w-lg rounded-lg bg-surface p-0',
        'text-text shadow-overlay backdrop:bg-text/40',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-0.5 text-sm text-text-muted">
              {description}
            </p>
          )}
        </div>

        {dismissible && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {children && <div className="px-4 py-4 sm:px-5">{children}</div>}

      {footer && (
        <div className="flex flex-wrap justify-end gap-3 border-t border-border px-4 py-3 sm:px-5">
          {footer}
        </div>
      )}
    </dialog>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  /** Descreva o efeito em texto claro, não "Tem certeza?". */
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}

/**
 * Confirmação antes de ação destrutiva.
 *
 * docs/DESIGN_SYSTEM.md §5: obrigatória antes de qualquer ação destrutiva, com
 * o efeito descrito em texto claro. "Tem certeza?" não informa nada — a
 * descrição precisa dizer o que vai acontecer e se dá para desfazer.
 */
export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      dismissible={!loading}
      className="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
