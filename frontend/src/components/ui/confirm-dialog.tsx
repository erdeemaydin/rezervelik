"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface ConfirmDetail {
  label: string
  value: string
}

export interface ConfirmOptions {
  title?: string
  description?: React.ReactNode
  /** Optional key/value rows shown in a boxed summary (e.g. reservation details). */
  details?: ConfirmDetail[]
  confirmText?: string
  cancelText?: string
  /** "danger" renders a solid-red confirm button for destructive actions. */
  tone?: "danger" | "default"
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = React.createContext<ConfirmFn | null>(null)

/**
 * Styled, app-wide replacement for window.confirm(). Returns a promise that
 * resolves true/false. Supports a boxed detail summary so prompts can show what
 * is about to be affected (e.g. "Reservation at 20:00 for Erdem · 4 pax").
 */
export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm must be used within a <ConfirmProvider>")
  return ctx
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [opts, setOpts] = React.useState<ConfirmOptions>({})
  const resolver = React.useRef<((v: boolean) => void) | null>(null)

  const confirm = React.useCallback<ConfirmFn>((o) => {
    setOpts(o)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = React.useCallback((value: boolean) => {
    setOpen(false)
    resolver.current?.(value)
    resolver.current = null
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(isOpen: boolean) => {
          if (!isOpen) settle(false)
        }}
      >
        <DialogContent maxWidth="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-lg">{opts.title ?? "Are you sure?"}</DialogTitle>
            {opts.description ? (
              <DialogDescription className="text-[0.95rem]">{opts.description}</DialogDescription>
            ) : null}
          </DialogHeader>

          {opts.details?.length ? (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1.5">
              {opts.details.map((d, i) => (
                <div key={i} className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">{d.label}</span>
                  <span className="font-semibold text-right">{d.value}</span>
                </div>
              ))}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => settle(false)}>
              {opts.cancelText ?? "Cancel"}
            </Button>
            <Button
              variant={opts.tone === "danger" ? "destructive" : "default"}
              className={cn(
                opts.tone === "danger" && "bg-red-600 text-white hover:bg-red-700"
              )}
              onClick={() => settle(true)}
              autoFocus
            >
              {opts.confirmText ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}
