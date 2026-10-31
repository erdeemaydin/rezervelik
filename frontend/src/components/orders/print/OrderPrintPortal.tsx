'use client';

import { useEffect, useRef, useState } from 'react';
import { StaffOrder, StaffOrderItem } from '@/lib/orders/types';
import { KitchenTicketTemplate, CourierSlipTemplate, CustomerReceiptTemplate, formatTRY } from './templates';
import { tryPrintViaQz } from '@/lib/qzPrint';

export type PrintTemplateKind = 'kitchen' | 'courier' | 'receipt';

export interface PrintJob {
  order: StaffOrder;
  templates: PrintTemplateKind[];
}

// Reliable path: a hidden-until-print root + window.print() + a print-only
// stylesheet — the standard technique for this (this codebase had no prior
// window.print()/@media print usage anywhere to follow — checked via grep —
// so this establishes the pattern fresh). The print root is hidden on screen
// and the *rest of the page* is hidden while printing, via
// `visibility: hidden` on everything except #order-print-root — more robust
// than only toggling the board's own container, since it also hides portaled
// UI (toasts, dialogs) that live outside this component tree.
//
// Best-effort path: attempts QZ Tray first (see lib/qzPrint.ts — honestly
// just a stub today, will no-op) and only falls back to window.print() when
// that doesn't succeed, so a future real QZ integration silently takes over
// without any change here.
function itemsToPlainText(order: StaffOrder, withPrices: boolean): string {
  const lines: string[] = [`Order #${order.orderNumber}`, order.fulfillmentType, ''];
  for (const item of order.items as StaffOrderItem[]) {
    lines.push(`${item.quantity}x ${item.nameSnapshot}${withPrices ? `  ${formatTRY(item.unitPrice * item.quantity)}` : ''}`);
    (item.modifiersSnapshot || []).forEach((m) => lines.push(`   + ${m.name}`));
  }
  if (withPrices) {
    lines.push('', `Subtotal: ${formatTRY(order.subtotal)}`, `Total: ${formatTRY(order.total)}`);
  }
  if (order.customerNote) lines.push('', `Note: ${order.customerNote}`);
  return lines.join('\n');
}

export function PrintStyles() {
  return (
    <style>{`
      @media print {
        @page { size: auto; margin: 6mm; }
        html, body { background: #fff !important; }
        body > *:not(#order-print-portal-root) { display: none !important; }
        #order-print-portal-root { display: block !important; }
        #order-print-root { display: block !important; width: 78mm; margin: 0 auto; }
        #order-print-root .print-doc { page-break-after: always; }
        #order-print-root .print-doc:last-child { page-break-after: auto; }
      }
      @media screen {
        #order-print-portal-root { display: none; }
      }
    `}</style>
  );
}

// NOTE: this takes a single `job` slot, not a queue — if the board fires a
// second print request (e.g. a manual reprint click) while one is still in
// flight, the effect below sees printingRef.current === true and silently
// drops it rather than queueing it. Acceptable for now (a single-operator
// kitchen tablet rarely fires overlapping print requests, and re-clicking
// Print recovers it instantly), but worth knowing if this ever needs to get
// more robust — the fix would be lifting an actual array queue up into
// page.tsx instead of a single printJob value.
export default function OrderPrintPortal({ job, onDone }: { job: PrintJob | null; onDone: () => void }) {
  const printingRef = useRef(false);
  // Snapshot of the job actually being printed, rendered instead of the raw
  // `job` prop. Without this, the DOM under #order-print-root is bound
  // directly to whatever `job` the parent last passed — if the parent swaps
  // to a second order while the first print's 80ms setTimeout (below) is
  // still pending, the guard correctly refuses to START a second print
  // cycle, but the already-scheduled window.print() call fires against
  // whatever is CURRENTLY rendered, which by then is the second order's
  // ticket. Pinning render to a snapshot taken the instant we lock
  // printingRef keeps what's on screen (and thus what actually prints)
  // stable for the duration of one print cycle, regardless of later prop
  // changes.
  const [activeJob, setActiveJob] = useState<PrintJob | null>(null);

  useEffect(() => {
    if (!job || printingRef.current) return;
    printingRef.current = true;
    setActiveJob(job);

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      printingRef.current = false;
      setActiveJob(null);
      window.removeEventListener('afterprint', finish);
      onDone();
    };

    (async () => {
      const withPrices = job.templates.includes('receipt');
      const qzJobs = job.templates.map((kind) => ({
        title: `${kind}-${job.order.orderNumber}`,
        text: itemsToPlainText(job.order, kind === 'receipt' || withPrices),
      }));
      const handledByQz = await tryPrintViaQz(qzJobs);
      if (handledByQz) {
        finish();
        return;
      }

      // Give React a tick to paint the print root before invoking print().
      window.addEventListener('afterprint', finish);
      setTimeout(() => {
        window.print();
        // Safari/older browsers sometimes never fire 'afterprint' reliably —
        // this safety timeout clears the print job either way so the board
        // never gets stuck unable to start another print.
        setTimeout(finish, 4000);
      }, 80);
    })();
  }, [job, onDone]);

  return (
    <div id="order-print-portal-root">
      <PrintStyles />
      {activeJob && (
        <div id="order-print-root">
          {activeJob.templates.map((kind) => (
            <div key={kind} className="print-doc pb-4">
              {kind === 'kitchen' && <KitchenTicketTemplate order={activeJob.order} />}
              {kind === 'courier' && <CourierSlipTemplate order={activeJob.order} />}
              {kind === 'receipt' && <CustomerReceiptTemplate order={activeJob.order} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
