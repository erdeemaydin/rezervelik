'use client';

import { QRCodeCanvas } from 'qrcode.react';
import { useTranslation } from '@/i18n/provider';
import { StaffOrder, StaffOrderAddressSnapshot, StaffOrderItem } from '@/app/order-station/types';

// Three separate printable templates per docs/packaging/online-ordering-plan.md
// §1f: kitchen ticket (no prices), courier/delivery slip (delivery orders
// only, COD amount + maps QR), customer receipt (itemized, with prices).
// Rendered inside OrderPrintPortal.tsx's hidden-until-print root and printed
// via window.print() (see that file for the QZ Tray attempt + fallback).
// Deliberately plain/monochrome, sized for an ~80mm thermal roll — this
// codebase has no prior window.print() pattern to follow (checked: no
// @media print usage anywhere else), so the print CSS lives in
// OrderPrintPortal.tsx's <PrintStyles>.

export const formatTRY = (n: number) => n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });

function formatModifiers(item: StaffOrderItem, withPrices: boolean): string | null {
  if (!item.modifiersSnapshot || item.modifiersSnapshot.length === 0) return null;
  return item.modifiersSnapshot
    .map((m) => (withPrices && m.priceAdjust ? `${m.name} (+${formatTRY(m.priceAdjust)})` : m.name))
    .join(', ');
}

function mapsUrlFor(addr: StaffOrderAddressSnapshot): string {
  if (typeof addr.lat === 'number' && typeof addr.lng === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${addr.lat},${addr.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr.fullAddress)}`;
}

function TicketHeader({ heading, order }: { heading: string; order: StaffOrder }) {
  const { t } = useTranslation();
  return (
    <div className="mb-2 border-b border-dashed border-black pb-2 text-center">
      <div className="text-sm font-black uppercase tracking-wide">{heading}</div>
      <div className="mt-1 text-lg font-black">
        {t('orderStation.ticket.orderLabel')} #{order.orderNumber}
      </div>
      <div className="mt-1 flex items-center justify-center gap-2 text-[11px] font-bold">
        <span>{t(`publicOrder.fulfillment.${order.fulfillmentType === 'DELIVERY' ? 'delivery' : 'pickup'}`)}</span>
        <span>&middot;</span>
        <span>{new Date(order.createdAt).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>
      </div>
    </div>
  );
}

export function KitchenTicketTemplate({ order }: { order: StaffOrder }) {
  const { t } = useTranslation();
  return (
    <div className="w-full font-mono text-black">
      <TicketHeader heading={t('orderStation.ticket.kitchenHeading')} order={order} />
      <div className="space-y-2">
        {order.items.length === 0 ? (
          <div className="text-xs italic">{t('orderStation.ticket.noItems')}</div>
        ) : (
          order.items.map((item) => {
            const mods = formatModifiers(item, false);
            return (
              <div key={item.id} className="text-[13px] leading-tight">
                <div className="font-black">
                  {item.quantity}&times; {item.nameSnapshot}
                </div>
                {mods && <div className="pl-3 text-[11px]">+ {mods}</div>}
              </div>
            );
          })
        )}
      </div>
      {order.customerNote && (
        <div className="mt-3 border-t border-dashed border-black pt-2 text-[12px]">
          <span className="font-black uppercase">{t('orderStation.ticket.noteLabel')}: </span>
          {order.customerNote}
        </div>
      )}
    </div>
  );
}

export function CourierSlipTemplate({ order }: { order: StaffOrder }) {
  const { t } = useTranslation();
  const addr = order.addressSnapshot;
  const codDue = order.paymentMethod === 'CASH_ON_DELIVERY';

  return (
    <div className="w-full font-mono text-black">
      <TicketHeader heading={t('orderStation.ticket.courierHeading')} order={order} />

      <div className="space-y-1 text-[12px]">
        <div>
          <span className="font-black uppercase">{t('orderStation.ticket.customerLabel')}: </span>
          {order.customer?.name || '—'}
        </div>
        <div>
          <span className="font-black uppercase">{t('orderStation.ticket.phoneLabel')}: </span>
          {order.customer?.phone || '—'}
        </div>
        {addr && (
          <div>
            <span className="font-black uppercase">{t('orderStation.ticket.addressLabel')}: </span>
            {[addr.label, addr.neighborhood, addr.fullAddress].filter(Boolean).join(' — ')}
            {addr.note && <div className="pl-3 italic">{addr.note}</div>}
          </div>
        )}
      </div>

      {codDue ? (
        <div className="mt-3 border-2 border-black p-2 text-center">
          <div className="text-[10px] font-black uppercase">{t('orderStation.ticket.codLabel')}</div>
          <div className="text-2xl font-black">{formatTRY(order.total)}</div>
        </div>
      ) : (
        <div className="mt-3 border border-black p-2 text-center text-[11px] font-black uppercase">
          {t('publicOrder.payment.onlineCard')} — {order.paymentStatus === 'PAID' ? t('orderStation.ticket.paidLabel') : t('orderStation.ticket.unpaidLabel')}
        </div>
      )}

      {addr && (
        <div className="mt-3 flex flex-col items-center gap-1">
          <QRCodeCanvas value={mapsUrlFor(addr)} size={140} level="M" includeMargin />
          <div className="text-[10px] font-bold uppercase">{t('orderStation.ticket.mapCaption')}</div>
        </div>
      )}
    </div>
  );
}

export function CustomerReceiptTemplate({ order }: { order: StaffOrder }) {
  const { t } = useTranslation();
  return (
    <div className="w-full font-mono text-black">
      <TicketHeader heading={t('orderStation.ticket.receiptHeading')} order={order} />

      <div className="space-y-2">
        {order.items.map((item) => {
          const mods = formatModifiers(item, true);
          // item.unitPrice already bakes in modifier price adjustments
          // (src/services/orderPricingService.ts: unitPrice = menuItem.price +
          // modifierTotal) — modifiersSnapshot is for display only (the "+ Extra
          // cheese (+₺10)" line below), re-adding its priceAdjust here double-counts.
          const lineTotal = item.unitPrice * item.quantity;
          return (
            <div key={item.id} className="text-[12px] leading-tight">
              <div className="flex justify-between font-bold">
                <span>{item.quantity}&times; {item.nameSnapshot}</span>
                <span>{formatTRY(lineTotal)}</span>
              </div>
              {mods && <div className="pl-3 text-[10px]">{mods}</div>}
            </div>
          );
        })}
      </div>

      <div className="mt-3 space-y-1 border-t border-dashed border-black pt-2 text-[12px]">
        <div className="flex justify-between">
          <span>{t('orderStation.ticket.subtotalLabel')}</span>
          <span>{formatTRY(order.subtotal)}</span>
        </div>
        {order.fulfillmentType === 'DELIVERY' && (
          <div className="flex justify-between">
            <span>{t('orderStation.ticket.deliveryFeeLabel')}</span>
            <span>{formatTRY(order.deliveryFee)}</span>
          </div>
        )}
        <div className="flex justify-between text-[14px] font-black">
          <span>{t('orderStation.ticket.totalLabel')}</span>
          <span>{formatTRY(order.total)}</span>
        </div>
        <div className="flex justify-between text-[10px] uppercase">
          <span>{t('orderStation.ticket.paymentMethodLabel')}</span>
          <span>{t(`publicOrder.payment.${order.paymentMethod === 'CASH_ON_DELIVERY' ? 'cashOnDelivery' : 'onlineCard'}`)}</span>
        </div>
      </div>

      <div className="mt-3 text-center text-[11px] font-bold">{t('orderStation.ticket.thankYou')}</div>
    </div>
  );
}
