import { InvoiceDto } from '../models/payment.models';

const mockInvoiceSeed: InvoiceDto[] = [
  {
    invoiceId: 'f7159a86-5074-4b4d-baf4-6dfadf8b0f01',
    invoiceNumber: 'INV-2026-001',
    orderId: '66f03df3-02f9-44bc-93ba-977ddf899a11',
    dealerId: '11111111-1111-1111-1111-111111111111',
    idempotencyKey: 'demo-invoice-1',
    gstType: 'CGST+SGST',
    gstRate: 18,
    subtotal: 57500,
    gstAmount: 10350,
    grandTotal: 67850,
    pdfStoragePath: '/mock/invoices/INV-2026-001.pdf',
    createdAtUtc: '2026-03-30T09:15:00Z',
    lines: [
      {
        invoiceLineId: 'a4ddf2c8-89df-4a49-a44a-78f5f8d73601',
        productId: '8d71d5bc-31bd-4ef7-a0fb-e1bca4d15101',
        productName: 'Industrial Lubricant X500',
        sku: 'LUB-X500',
        hsnCode: '27101980',
        quantity: 25,
        unitPrice: 1150,
        lineTotal: 28750
      },
      {
        invoiceLineId: 'cc8f7f16-f6c2-4d56-b1df-e2f5d6d5c102',
        productId: 'f3027f90-8ab6-4d65-a0d9-5e2668978f02',
        productName: 'Hydraulic Filter HF-200',
        sku: 'HF-200',
        hsnCode: '84212900',
        quantity: 40,
        unitPrice: 720,
        lineTotal: 28800
      }
    ]
  },
  {
    invoiceId: '9d1baf63-c447-4872-9750-f7e83c48d502',
    invoiceNumber: 'INV-2026-002',
    orderId: 'f56ea6f4-a00a-4f8f-9d3a-849b6cae2e55',
    dealerId: '11111111-1111-1111-1111-111111111111',
    idempotencyKey: 'demo-invoice-2',
    gstType: 'IGST',
    gstRate: 18,
    subtotal: 86400,
    gstAmount: 15552,
    grandTotal: 101952,
    pdfStoragePath: '/mock/invoices/INV-2026-002.pdf',
    createdAtUtc: '2026-03-29T13:40:00Z',
    lines: [
      {
        invoiceLineId: 'f8f5aab4-57bb-4af9-a05b-9bcbec8fe201',
        productId: '8ba7144a-7f11-485f-b0ca-69074454b201',
        productName: 'Conveyor Belt Assembly 2m',
        sku: 'CB-2M-ASM',
        hsnCode: '40103200',
        quantity: 12,
        unitPrice: 4200,
        lineTotal: 50400
      },
      {
        invoiceLineId: '12ca13dd-27c8-4f0c-a52d-e2c658733202',
        productId: '3af95f7c-5fc8-48d9-9f4f-25eb6752d202',
        productName: 'Bearing Kit BK-44',
        sku: 'BK-44',
        hsnCode: '84821090',
        quantity: 60,
        unitPrice: 600,
        lineTotal: 36000
      }
    ]
  },
  {
    invoiceId: '02fd77ec-882a-4ef5-a552-fec34a307003',
    invoiceNumber: 'INV-2026-003',
    orderId: 'f4c8542a-3852-4d5d-a6ab-84763b0f3033',
    dealerId: '11111111-1111-1111-1111-111111111111',
    idempotencyKey: 'demo-invoice-3',
    gstType: 'CGST+SGST',
    gstRate: 12,
    subtotal: 32950,
    gstAmount: 3954,
    grandTotal: 36904,
    pdfStoragePath: '/mock/invoices/INV-2026-003.pdf',
    createdAtUtc: '2026-03-27T07:55:00Z',
    lines: [
      {
        invoiceLineId: 'ef2789cb-7adf-41ef-abd2-e9ea5f96e301',
        productId: '33fd0f36-a5a4-4de5-b702-10dd613ce301',
        productName: 'Safety Gloves (Pack of 100)',
        sku: 'SAFE-GLOVE-100',
        hsnCode: '61161000',
        quantity: 35,
        unitPrice: 410,
        lineTotal: 14350
      },
      {
        invoiceLineId: '8fe2586b-6ef4-44cf-a5ee-76ce5e3f8302',
        productId: 'fb02b420-1f8d-4d2f-93f3-7676f3cb3302',
        productName: 'Industrial Cleaner IC-20L',
        sku: 'IC-20L',
        hsnCode: '34022010',
        quantity: 27,
        unitPrice: 690,
        lineTotal: 18630
      }
    ]
  }
];

export function mockInvoicesForDealer(dealerId: string): InvoiceDto[] {
  return mockInvoiceSeed
    .map(invoice => ({ ...invoice, dealerId }))
    .sort((a, b) => new Date(b.createdAtUtc).getTime() - new Date(a.createdAtUtc).getTime());
}

export function findMockInvoiceById(invoiceId: string, dealerId?: string): InvoiceDto | undefined {
  const invoices = dealerId ? mockInvoicesForDealer(dealerId) : mockInvoiceSeed;
  return invoices.find(i => i.invoiceId === invoiceId);
}
