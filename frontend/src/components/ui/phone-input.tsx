"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

// Standardized phone field (#7.7): a fixed country-code box (default +90) plus a
// separate national-number field. Emits a combined E.164-ish string
// ("+90XXXXXXXXXX") via onChange, dropping any leading zero the user types.

const digitsOnly = (s: string) => (s || "").replace(/\D/g, "")

export function splitPhone(value?: string | null): { code: string; number: string } {
  if (!value) return { code: "90", number: "" }
  const d = digitsOnly(value)
  // Assume a 1-2 digit country code; default TR (+90) when it starts with 90.
  if (d.startsWith("90") && d.length > 2) return { code: "90", number: d.slice(2) }
  return { code: d.slice(0, 2) || "90", number: d.slice(2) }
}

interface PhoneInputProps {
  value?: string | null
  onChange: (combined: string) => void
  countryHint?: string
  className?: string
  disabled?: boolean
}

export function PhoneInput({ value, onChange, countryHint, className, disabled }: PhoneInputProps) {
  const initial = splitPhone(value)
  const [code, setCode] = React.useState(initial.code)
  const [number, setNumber] = React.useState(initial.number)

  // Keep local fields in sync if the parent value changes externally.
  React.useEffect(() => {
    const s = splitPhone(value)
    setCode(s.code)
    setNumber(s.number)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const emit = (c: string, n: string) => {
    let nn = digitsOnly(n)
    if (nn.startsWith("0")) nn = nn.replace(/^0+/, "")
    onChange(nn ? `+${digitsOnly(c)}${nn}` : "")
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex gap-2">
        <div className="flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 h-11 w-20 shrink-0">
          <span className="text-slate-500 font-bold text-sm">+</span>
          <input
            value={code}
            disabled={disabled}
            onChange={(e) => { const c = digitsOnly(e.target.value).slice(0, 3); setCode(c); emit(c, number); }}
            className="w-full bg-transparent outline-none text-sm font-bold text-slate-700"
            inputMode="numeric"
          />
        </div>
        <Input
          type="tel"
          inputMode="numeric"
          disabled={disabled}
          value={number}
          onChange={(e) => { const n = digitsOnly(e.target.value); setNumber(n); emit(code, n); }}
          placeholder="5XXXXXXXXX"
          className="h-11 flex-1 text-sm font-bold"
        />
      </div>
      <span className="text-[10px] text-slate-400">{countryHint || "Enter the number without the leading zero."}</span>
    </div>
  )
}
