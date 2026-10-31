'use client';

import { useEffect, useRef } from 'react';
import { readAuth } from '@/lib/authStorage';
import { StaffOrder } from './types';

// Shared live-order SSE consumer — used by /order-station's board and by the
// dashboard "Active Orders" table.
//
// GET /api/orders/stream is mounted behind tenantMiddleware (requires the
// X-Restaurant-ID header, no query-string fallback — src/middlewares/tenant.ts
// is deliberately not being touched for this route) + authMiddleware (httpOnly
// session cookie) + requirePermission('manage_orders'). The browser's native
// EventSource can't set a custom header, so this hand-rolls SSE consumption on
// top of fetch()+ReadableStream instead: send X-Restaurant-ID explicitly,
// credentials:'include' to ride the httpOnly auth cookie (same-origin
// mechanism lib/api.ts relies on), and hand-parse the text/event-stream wire
// format (split on blank lines, read `event:`/`data:` lines) — it's a small,
// well-documented format, not worth a dependency for. Reconnects with
// exponential backoff on any drop (SSE doesn't survive proxy/idle timeouts
// forever — see the 25s heartbeat comment in orderController.ts's streamOrders,
// which this deliberately ignores).

const STREAM_API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3000/api`
    : 'http://localhost:3000/api');

export interface OrderStreamEvent {
  type: 'created' | 'status_changed';
  order: StaffOrder;
}

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

export function useOrderStream(onEvent: (evt: OrderStreamEvent) => void, enabled: boolean, onConnectionChange?: (connected: boolean) => void) {
  // Refs so the long-lived connect loop below always calls the latest
  // callback without needing to be torn down and reconnected every render.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onConnectionChangeRef = useRef(onConnectionChange);
  onConnectionChangeRef.current = onConnectionChange;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let controller: AbortController | null = null;
    let backoffMs = INITIAL_BACKOFF_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const parseFrame = (rawFrame: string) => {
      if (!rawFrame) return;
      let eventType = '';
      const dataLines: string[] = [];
      for (const line of rawFrame.split('\n')) {
        if (line.startsWith(':')) continue; // comment / heartbeat / ": connected"
        if (line.startsWith('event:')) eventType = line.slice('event:'.length).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trim());
      }
      if (!dataLines.length) return;
      if (eventType !== 'created' && eventType !== 'status_changed') return;
      try {
        const order = JSON.parse(dataLines.join('\n')) as StaffOrder;
        onEventRef.current({ type: eventType, order });
      } catch (err) {
        console.error('[orders] failed to parse SSE event payload:', err);
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      onConnectionChangeRef.current?.(false);
      const wait = backoffMs;
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      reconnectTimer = setTimeout(connect, wait);
    };

    async function connect() {
      if (cancelled) return;
      const restaurantId = readAuth('restaurantId');
      if (!restaurantId) {
        scheduleReconnect();
        return;
      }

      controller = new AbortController();
      try {
        const res = await fetch(`${STREAM_API_URL}/orders/stream`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'X-Restaurant-ID': restaurantId, Accept: 'text/event-stream' },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`order stream request failed with status ${res.status}`);
        }

        backoffMs = INITIAL_BACKOFF_MS; // reset on a successful connect
        onConnectionChangeRef.current?.(true);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sepIndex: number;
          while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
            const rawFrame = buffer.slice(0, sepIndex);
            buffer = buffer.slice(sepIndex + 2);
            parseFrame(rawFrame);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[orders] SSE stream dropped, will reconnect:', err);
        }
      }
      if (!cancelled) scheduleReconnect();
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      controller?.abort();
    };
  }, [enabled]);
}
