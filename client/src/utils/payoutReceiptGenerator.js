import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

/**
 * Generates a printable PDF receipt for a completed payout.
 * @param {Object} payout - The payout data object.
 */
export const generatePayoutReceipt = (payout) => {
    if (!payout) return;

    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-PH', { 
        year: 'numeric', month: 'long', day: 'numeric' 
    });
    const timeStr = new Date().toLocaleTimeString('en-PH', { 
        hour: '2-digit', minute: '2-digit' 
    });

    // Header
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text('PAWZZLE', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-400
    doc.text('OFFICIAL PAYOUT RECEIPT', 105, 28, { align: 'center' });

    // Payout Info Side-by-Side
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85); // slate-700
    
    // Left Column
    doc.setFont('helvetica', 'bold');
    doc.text('REFERENCE NUMBER:', 20, 45);
    doc.setFont('helvetica', 'normal');
    doc.text(payout.referenceNumber || 'N/A', 60, 45);

    doc.setFont('helvetica', 'bold');
    doc.text('STATUS:', 20, 52);
    doc.setFont('helvetica', 'normal');
    doc.text(payout.status?.toUpperCase() || 'COMPLETED', 60, 52);

    doc.setFont('helvetica', 'bold');
    doc.text('DATE GENERATED:', 20, 59);
    doc.setFont('helvetica', 'normal');
    doc.text(`${dateStr} ${timeStr}`, 60, 59);

    // Right Column
    doc.setFont('helvetica', 'bold');
    doc.text('STORE NAME:', 120, 45);
    doc.setFont('helvetica', 'normal');
    doc.text(payout.store?.name || 'N/A', 150, 45);

    doc.setFont('helvetica', 'bold');
    doc.text('OWNER:', 120, 52);
    doc.setFont('helvetica', 'normal');
    const ownerName = payout.owner ? `${payout.owner.firstName} ${payout.owner.lastName}` : 'N/A';
    doc.text(ownerName, 150, 52);

    doc.setFont('helvetica', 'bold');
    doc.text('ACCOUNT:', 120, 59);
    doc.setFont('helvetica', 'normal');
    doc.text(payout.owner?.email || 'N/A', 150, 59);

    // Divider
    doc.setDrawColor(241, 245, 249); // slate-100
    doc.line(20, 68, 190, 68);

    // Financial Breakdown Table
    const grossAmount = payout.amount / 0.9;
    const platformFee = grossAmount * 0.1;
    
    doc.autoTable({
        startY: 75,
        head: [['DESCRIPTION', 'DETAILS', 'AMOUNT']],
        body: [
            ['Gross Earnings', 'Total revenue before fees', `PHP ${grossAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
            ['Platform Fee', 'Pawzzle Service Fee (10%)', `- PHP ${platformFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
            ['Net Payout', 'Amount disbursed to account', `PHP ${payout.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]
        ],
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
            0: { cellWidth: 50 },
            1: { cellWidth: 80 },
            2: { halign: 'right', fontStyle: 'bold' }
        },
        styles: { fontSize: 9, cellPadding: 5 }
    });

    // Payout Method Section
    const tableFinalY = doc.lastAutoTable.finalY + 15;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('DISBURSEMENT DETAILS', 20, tableFinalY);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const methodType = payout.payoutMethod?.type?.replace('_', ' ').toUpperCase() || 'N/A';
    doc.text(`Method: ${methodType}`, 20, tableFinalY + 8);
    doc.text(`Account Name: ${payout.payoutMethod?.accountName || 'N/A'}`, 20, tableFinalY + 14);
    doc.text(`Account Number: ${payout.payoutMethod?.accountNumber || 'N/A'}`, 20, tableFinalY + 20);
    if (payout.payoutMethod?.bankName) {
        doc.text(`Bank Name: ${payout.payoutMethod.bankName}`, 20, tableFinalY + 26);
    }

    // Processed By Section
    const processedAt = payout.processedAt ? new Date(payout.processedAt).toLocaleDateString('en-PH', { 
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
    }) : 'N/A';
    
    doc.text(`Processed At: ${processedAt}`, 120, tableFinalY + 8);
    const adminName = payout.processedBy ? `${payout.processedBy.firstName} ${payout.processedBy.lastName}` : 'System Admin';
    doc.text(`Processed By: ${adminName}`, 120, tableFinalY + 14);

    // Footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('This is a computer-generated document. No signature is required.', 105, pageHeight - 20, { align: 'center' });
    doc.text('Pawzzle - Your All-in-One Pet Care Platform', 105, pageHeight - 15, { align: 'center' });

    // Save PDF
    doc.save(`Payout_Receipt_${payout.referenceNumber}.pdf`);
};
