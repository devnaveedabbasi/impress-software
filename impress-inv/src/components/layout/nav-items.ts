export interface NavItem {
  label: string;
  href?: string;
  children?: NavItem[];
  operation?: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Master Enter Registration",
    children: [
      { label: "Category", href: "/master-entries/categories", operation: "category" },
      { label: "City", href: "/master-entries/cities", operation: "city" },
      { label: "Province", href: "/master-entries/provinces", operation: "province" },
      { label: "Station", href: "/master-entries/stations", operation: "station" },
      { label: "Dealer", href: "/master-entries/dealers", operation: "dealer" },
      { label: "Vendor", href: "/master-entries/vendors", operation: "vendor" },
      { label: "Department", href: "/master-entries/departments", operation: "department" },
      { label: "Inventory", href: "/master-entries/inventory", operation: "inventory" },
    ],
  },
  {
    label: "Store Department",
    children: [
      { label: "Inward Quality Control", href: "/store/inward-quality-control", operation: "inward_quality_control" },
      { label: "Inward Quality Control Report", href: "/store/inward-quality-control-report", operation: "inward_quality_control_report" },
      { label: "Gate Pass for Sold Item", href: "/store/gate-pass-sold-item", operation: "gate_pass_sold_item" },
      { label: "Rejection Return to Vendor", href: "/store/rejection-return-to-vendor", operation: "rejection_return_to_vendor" },
      { label: "Rejection Received from Dealer", href: "/store/rejection-received-from-dealer", operation: "rejection_received_from_dealer" },
      { label: "Issue from Line", href: "/store/issue-from-line", operation: "issue_from_line" },
      { label: "Item Return from Department", href: "/store/item-return-from-department", operation: "item_return_from_department" },
      { label: "Transfer Form", href: "/store/transfer-form", operation: "transfer_form" },
      {
        label: "Report",
        children: [
          { label: "Issue Report", href: "/store/reports/issue", operation: "issue_report" },
          { label: "Stock Ledger", href: "/store/reports/stock-ledger", operation: "stock_ledger" },
          { label: "Item Ledger", href: "/store/reports/item-ledger", operation: "item_ledger" },
          { label: "Stock Register", href: "/store/reports/stock-register", operation: "stock_register" },
          { label: "Shortage Report", href: "/store/reports/shortage", operation: "shortage_report" },
        ],
      },
    ],
  },
  {
    label: "Purchase Department",
    children: [
      { label: "Purchase Order", href: "/purchase/purchase-order", operation: "purchase_order" },
      { label: "Purchase Invoice", href: "/purchase/purchase-invoice", operation: "purchase_invoice" },
    ]
  },
  {
    label: "Paint Shop Dept", children: [
      { label: "Paint Shop Inward", href: "/paint-shop/paint-shop-inward", operation: "paint_shop_inward" },
      { label: "Paint Shop Outward", href: "/paint-shop/paint-shop-outward", operation: "paint_shop_outward" },
    ]
  },
  {
    label: "Dispatch Department", children: [
      { label: "Dispatch Inward", href: "/dispatch/dispatch-inward", operation: "dispatch_inward" },
      { label: "Dispatch Outward", href: "/dispatch/dispatch-outward", operation: "dispatch_outward" },
    ]
  },
  {
    label: "Sales Department", children: [
      { label: "Purchase Order", href: "/sales/purchase-order", operation: "purchase_order" },
      { label: "Sales Order", href: "/sales/sales-order", operation: "sales_order" },
      // { label: "Sales Invoice", href: "/sales/sales-invoice", operation: "sales_invoice" },
      { label: "Quotation", href: "/sales/quotation", operation: "quotation" },
      { label: "Sale Gate Pass", href: "/sales/sale-gate-pass", operation: "sale_gate_pass" },
    ]
  },
  {
    label: "Account Department",
    children: [
      { label: "Users", href: "/account-department/add-user", operation: "user" },
      { label: "Roles", href: "/account-department/add-role", operation: "role" },
      { label: "Permissions", href: "/account-department/permissions", operation: "permission" },
      { label: "Account Code", href: "/account-department/account-code", operation: "account_code" },
    ],
  },
  {
    label: "Window",
    children: [
      { label: "Window 1", href: "/window/window1", operation: "window1" },
      { label: "Window 2", href: "/window/window2", operation: "window2" },
    ],
  },
];
