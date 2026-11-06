// An invoice as its customer sees it in "To pay".
export type CustomerInvoice = {
  id: string;
  merchantName: string;
  memo: string;
};

// An invoice's saved details as its merchant sees them.
export type InvoiceCustomer = {
  id: string;
  merchantName: string;
  memo: string;
  customerName: string;
  customerEmail: string;
};
