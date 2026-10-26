"use client"

// A time picker that renders in the platform's chosen clock convention
// (24-hour for METRIC, 12-hour AM/PM for US — see lib/format), instead of the
// native <input type="time"> whose 12h/24h display follows the browser/OS locale
// and therefore ignores the GlobalSettings.measurementSystem choice. The selected
// value stays a canonical 24h "HH:mm" string, so callers/backend are unaffected.

import * as React from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useFormatStore } from "@/store/useFormatStore"
import { timeOptions as buildTimeOptions, formatTime } from "@/lib/format"

interface TimeSelectProps {
  value: string // canonical "HH:mm"
  onChange: (value: string) => void
  step?: number // minute granularity, default 5
  className?: string
  placeholder?: string
  id?: string
  disabled?: boolean
}

export function TimeSelect({
  value,
  onChange,
  step = 5,
  className,
  placeholder,
  id,
  disabled,
}: TimeSelectProps) {
  const system = useFormatStore((s) => s.system)

  const options = React.useMemo(() => {
    const opts = buildTimeOptions(system, step)
    // Keep an off-grid current value (e.g. an existing "19:37") selectable.
    if (value && !opts.some((o) => o.value === value)) {
      opts.push({ value, label: formatTime(value, system) })
      opts.sort((a, b) => a.value.localeCompare(b.value))
    }
    return opts
  }, [system, step, value])

  return (
    <Select value={value || ""} onValueChange={(v) => onChange((v as string) || "")} disabled={disabled}>
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
