import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import jsPDF from 'jspdf';
import { useTranslation } from "@/i18n/provider";

interface QRCodePDFGeneratorProps {
  restaurantSlug: string;
  restaurantName: string;
}

export function QRCodePDFGenerator({ restaurantSlug, restaurantName }: QRCodePDFGeneratorProps) {
  const { t } = useTranslation();
  const qrRef = useRef<HTMLDivElement>(null);

  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}/r/${restaurantSlug}/menu`
    : `https://dining-reservation.com/r/${restaurantSlug}/menu`;

  const downloadPDF = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;

    const qrDataUrl = canvas.toDataURL('image/png');
    
    // Create portrait A4 PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    // Background
    pdf.setFillColor(250, 250, 250);
    pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');

    // Title
    pdf.setTextColor(15, 23, 42); // slate-900
    pdf.setFontSize(24);
    pdf.setFont("helvetica", "bold");
    const titleText = restaurantName;
    const titleX = (pdfWidth - pdf.getStringUnitWidth(titleText) * pdf.getFontSize() / pdf.internal.scaleFactor) / 2;
    pdf.text(titleText, titleX, 40);

    // QR Code
    const qrSize = 100;
    const qrX = (pdfWidth - qrSize) / 2;
    const qrY = 70;
    pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

    // Call to action text
    pdf.setTextColor(71, 85, 105); // slate-500
    pdf.setFontSize(16);
    pdf.setFont("helvetica", "normal");
    const ctaText = t('menus.downloadQR.scanText') || "Scan QR Code for Menu";
    const ctaX = (pdfWidth - pdf.getStringUnitWidth(ctaText) * pdf.getFontSize() / pdf.internal.scaleFactor) / 2;
    pdf.text(ctaText, ctaX, 190);

    // Regulation compliance text
    pdf.setFontSize(10);
    pdf.setTextColor(100, 116, 139); // slate-400
    const complianceText = t('menus.downloadQR.complianceText') || "Allergen and calorie information is available in our digital menu.";
    const complianceX = (pdfWidth - pdf.getStringUnitWidth(complianceText) * pdf.getFontSize() / pdf.internal.scaleFactor) / 2;
    pdf.text(complianceText, complianceX, 200);

    pdf.save(`${restaurantSlug}-qr-menu.pdf`);
  };

  return (
    <div className="flex flex-col items-start gap-4">
      {/* Hidden QR Code for Canvas Generation */}
      <div className="hidden" ref={qrRef}>
        <QRCodeCanvas 
          value={publicUrl} 
          size={500}
          level="H"
          includeMargin={true}
        />
      </div>
      
      <Button 
        onClick={downloadPDF} 
        variant="outline" 
        className="flex items-center gap-2 border-slate-200 hover:bg-slate-50"
      >
        <Download className="w-4 h-4" />
        {t('menus.downloadQR.buttonText') || "Download QR Label (PDF)"}
      </Button>
    </div>
  );
}
