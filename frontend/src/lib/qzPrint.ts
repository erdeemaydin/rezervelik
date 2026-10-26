// Thin, deliberately-isolated attempt at QZ Tray silent printing
// (docs/packaging/online-ordering-plan.md §1f recommends it: a local agent
// that talks ESC/POS to a thermal printer over `localhost`, no server changes
// needed). HONESTY NOTE for whoever reads this next: this module is a stub,
// not a working integration. QZ Tray requires its `qz-tray.js` client bundle
// to be loaded on the page (npm package `qz-tray` or a <script> tag) plus a
// certificate/signing handshake with the locally-running QZ Tray desktop
// agent — none of that is wired up anywhere in this app. `isQzAvailable()`
// will therefore always return false today, and every print job falls
// through to the window.print() path in OrderPrintPortal.tsx, which is the
// actually-working, verified-by-code-review path. This file exists purely as
// a clearly-labeled, isolated seam: whoever eventually gets real thermal
// hardware on-site (see the plan's resolved open question #3 — printer model/
// connection is a pre-launch checklist item, not something confirmed yet)
// can wire up the qz-tray client here without touching the board or the print
// templates.
export function isQzAvailable(): boolean {
  return typeof window !== 'undefined' && !!(window as any).qz?.websocket;
}

export interface QzPrintJob {
  /** Free-text label for logging only. */
  title: string;
  /** Plain-text body — real ESC/POS formatting (cut, bold, barcode commands)
   *  is NOT implemented here; this sends bare text through QZ's raw print
   *  path, which is enough to prove the pipe works but not a finished ticket
   *  format. */
  text: string;
}

/** Returns true if every job was handed to QZ Tray successfully, false if QZ
 *  isn't available or anything failed — callers should always fall back to
 *  window.print() on a false return, exactly as OrderPrintPortal.tsx does. */
export async function tryPrintViaQz(jobs: QzPrintJob[]): Promise<boolean> {
  if (!isQzAvailable()) return false;
  try {
    const qz = (window as any).qz;
    if (!qz.websocket.isActive()) {
      await qz.websocket.connect();
    }
    const printer = await qz.printers.getDefault();
    for (const job of jobs) {
      const config = qz.configs.create(printer);
      await qz.print(config, [job.text]);
    }
    return true;
  } catch (err) {
    console.error('[qzPrint] QZ Tray print attempt failed, falling back to window.print():', err);
    return false;
  }
}
