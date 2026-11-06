import { CustomerInvoices } from "./customer-invoices";

// These pages only render after login, so there is nothing to prerender for an instant navigation.
export const instant = false;

export default function CustomerInvoicesPage() {
  return <CustomerInvoices />;
}
