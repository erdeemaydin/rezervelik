import React from 'react';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useTranslation } from "@/i18n/provider";

export const PrintableMenuPDFGenerator = ({ menu, restaurantProfile }: { menu: any, restaurantProfile: any }) => {
    const { t } = useTranslation();

    const generatePDF = () => {
        const doc = new jsPDF();
        
        // Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(24);
        doc.text(restaurantProfile.name, 105, 20, { align: 'center' });
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'normal');
        doc.text(menu.name, 105, 30, { align: 'center' });
        
        if (menu.updatedAt) {
            doc.setFontSize(10);
            doc.setTextColor(150);
            doc.text(`Son Fiyat Guncelleme: ${new Date(menu.updatedAt).toLocaleDateString('tr-TR')}`, 105, 38, { align: 'center' });
            doc.setTextColor(0);
        }

        let startY = 50;

        menu.categories.forEach((cat: any) => {
            const allItems = [...(cat.items || [])];
            // Include items from subcategories for simpler printing
            if (cat.children && cat.children.length > 0) {
                cat.children.forEach((sub: any) => {
                    if (sub.items) {
                        sub.items.forEach((item: any) => {
                            allItems.push({
                                ...item,
                                name: `${sub.name} - ${item.name}`
                            });
                        });
                    }
                });
            }

            if (allItems.length === 0) return;
            
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text(cat.name.toUpperCase(), 14, startY);
            startY += 6;

            const tableData = allItems.map((item: any) => {
                const desc = item.description || '';
                const details = [];
                if (item.calories) details.push(`${item.calories} kcal`);
                if (item.containsAlcohol) details.push(`Alkol Icerir`);
                if (item.containsPork) details.push(`Domuz Eti Icerir`);
                if (item.dietaryTags) details.push(item.dietaryTags);
                
                const detailStr = details.length > 0 ? `\n[${details.join(' | ')}]` : '';
                return [
                    `${item.name}\n${desc}${detailStr}`,
                    `${item.price.toLocaleString('tr-TR')} TL`
                ];
            });

            autoTable(doc, {
                startY,
                head: [],
                body: tableData,
                theme: 'plain',
                styles: { fontSize: 11, cellPadding: 4, font: 'helvetica' },
                columnStyles: {
                    0: { cellWidth: 140 },
                    1: { cellWidth: 40, halign: 'right', fontStyle: 'bold' }
                },
            });
            
            startY = (doc as any).lastAutoTable.finalY + 15;
            
            if (startY > 250) {
                doc.addPage();
                startY = 20;
            }
        });

        // Add Footer
        doc.setFontSize(9);
        doc.setTextColor(100);
        const pageCount = (doc as any).internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.text(`Sayfa ${i} / ${pageCount}`, 105, 290, { align: 'center' });
        }

        doc.save(`${restaurantProfile.name.replace(/\\s+/g, '_')}_Menu.pdf`);
    };

    return (
        <Button size="sm" variant="outline" onClick={generatePDF} className="h-9 px-4 text-[10px] font-black uppercase border-slate-200 text-slate-600 shadow-sm bg-white hover:bg-slate-50">
            <FileText className="w-3.5 h-3.5 mr-1.5" /> Menu PDF
        </Button>
    );
};
