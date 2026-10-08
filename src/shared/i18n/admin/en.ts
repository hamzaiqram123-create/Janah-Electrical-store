/** Admin panel dictionary (English). Loaded only by the admin bundle. */
export const en: Record<string, string> = {
  "a.g.sales": "Sales", "a.g.catalog": "Catalogue", "a.g.customers": "Customers", "a.g.marketing": "Marketing and content", "a.g.system": "Reports and system",
  "a.nav.dashboard": "Dashboard", "a.nav.orders": "Orders", "a.nav.pos": "Counter sale", "a.nav.returns": "Returns and refunds", "a.nav.payments": "Payments", "a.nav.invoices": "Invoices",
  "a.nav.products": "Products", "a.nav.categories": "Categories", "a.nav.brands": "Brands", "a.nav.inventory": "Inventory", "a.nav.labels": "Barcode labels",
  "a.nav.customers": "Customers", "a.nav.reviews": "Reviews", "a.nav.tickets": "Support requests", "a.nav.coupons": "Discount codes", "a.nav.discounts": "Price discounts",
  "a.nav.banners": "Banners", "a.nav.homepage": "Homepage sections", "a.nav.pages": "Content pages", "a.nav.faqs": "FAQ", "a.nav.reports": "Reports", "a.nav.shipping": "Shipping",
  "a.nav.settings": "Settings", "a.nav.users": "Staff and roles", "a.nav.logs": "Activity log", "a.nav.notifications": "Notifications",

  // common
  "a.add": "Add", "a.all": "All", "a.yes": "Yes", "a.no": "No", "a.none": "None", "a.choose": "Choose…", "a.confirm": "Confirm", "a.saved": "Saved", "a.deleted": "Deleted",
  "a.delete_q": "Delete this item?", "a.delete_text": "This cannot be undone.", "a.search": "Search", "a.find": "Find", "a.open": "Open", "a.upload": "Upload", "a.no_rows": "Nothing here yet",
  "a.n_results": "{n} results", "a.print_pdf": "Print / PDF", "a.back_to_store": "Back to the store", "a.view_store": "View store", "a.not_staff": "This account is not a staff account.",
  "a.active": "Active", "a.disabled": "Disabled", "a.guest": "Guest", "a.registered": "Registered", "a.all_products": "All products", "a.product_id": "Product ID",
  "a.scan_ph": "Scan or type a barcode / SKU", "a.camera": "Camera", "a.camera_scan": "Scan with the camera", "a.camera_hint": "Hold the barcode inside the frame.",
  "a.camera_denied": "The camera could not be opened. Allow camera access for this site and try again.",
  "a.camera_unsupported": "Camera scanning needs Chrome or Edge on Android. A USB or Bluetooth scanner works in every browser.",

  // dashboard
  "a.dash_sub": "Sales are counted in Riyadh time and include VAT.", "a.kpi_today": "Sales today", "a.kpi_month": "Sales this month", "a.kpi_total": "Total sales", "a.kpi_avg": "Average order this month",
  "a.kpi_orders_n": "{n} orders", "a.kpi_vs_prev": "{pct} vs last month", "a.kpi_conv": "{pct}% of carts became orders (30 days)", "a.kpi_open": "Orders to fulfil", "a.kpi_customers": "Customers",
  "a.kpi_new_month": "{n} new this month", "a.kpi_products": "Active products", "a.kpi_low": "Low-stock products", "a.chart_sales": "Sales, last 30 days", "a.chart_sales_sub": "Daily sales in SAR",
  "a.needs_attention": "Needs attention", "a.att_returns": "Return requests waiting", "a.att_reviews": "Reviews to moderate", "a.att_tickets": "Open support requests",
  "a.recent_orders": "Latest orders", "a.top_products": "Top products, last 30 days", "a.low_stock": "Low stock", "a.min_n": "min {n}", "a.stock_ok": "All products are above their minimum.", "a.no_sales_yet": "No sales in this period",
  "a.todo_title": "Finish setting up the store", "a.todo_vat": "Add your VAT number. Without it invoices carry no VAT number or QR code.", "a.todo_contact": "Add the shop phone number so customers can reach you.",
  "a.todo_payment": "Online payment is off. Only cash on delivery is offered until the payment gateway keys are configured.", "a.todo_email": "Email delivery is not configured, so order emails are recorded but not sent.",

  // orders
  "a.orders_search": "Order number, name, phone or email", "a.move_to": "Move order to", "a.change_status_to": "Change status to: {status}", "a.history": "Order history",
  "a.customer_orders": "{n} orders", "a.mark_paid": "Record payment", "a.mark_paid_text": "Record that {total} SAR was received outside the payment gateway.", "a.refund": "Refund",
  "a.refund_text": "Up to {max} SAR can be refunded. Online payments are returned through the gateway and a credit note is issued.", "a.refunded_ok": "Refund recorded",
  "a.sync_payment": "Check payment with the gateway", "a.no_invoice": "No invoice has been issued for this order yet.", "a.issue_invoice": "Issue invoice", "a.restock": "Return the items to stock",
  "a.cancel_note": "Cancelling returns the items to stock and tells the customer.", "a.tracking_hint": "Leave empty to generate one", "a.note_hint": "Saved in the order history", "a.ch.web": "Online", "a.ch.pos": "In store",

  // POS
  "a.pos_sub": "Scan items, take payment and print the tax invoice. Stock is deducted immediately.", "a.pos_search": "Search by name or SKU", "a.pos_empty": "No items yet",
  "a.pos_empty_text": "Scan a barcode or search for a product to start the sale.", "a.pos_customer": "Customer and payment", "a.pos_vat_hint": "For a tax invoice in a company's name",
  "a.pos_complete": "Complete sale", "a.pos_done": "Sale completed", "a.pos_done_text": "Order {number}, total {total} SAR.", "a.pos_new": "New sale", "a.print_invoice": "Print invoice", "a.in_stock_n": "{n} in stock",

  // products
  "a.add_product": "Add product", "a.products_search": "Name, SKU or barcode", "a.low_only": "Low stock only", "a.out_only": "Out of stock only", "a.view_in_store": "View in store",
  "a.sec_basic": "Product details", "a.sec_pricing": "Pricing", "a.sec_pricing_hint": "Enter prices in SAR including VAT, as customers see them.", "a.sec_media": "Images and video",
  "a.media_after_save": "Save the product first, then add its images.", "a.media_hint": "JPG, PNG or WebP up to 8 MB. The first image is the main one.", "a.sec_seo": "Search engines",
  "a.sec_seo_hint": "Optional. Leave empty to use the product name and description.", "a.sec_visibility": "Visibility", "a.sec_inventory": "Inventory", "a.sec_shipping": "Shipping and warranty",
  "a.specs_hint": "The first three values are printed on the product card like a rating plate (for example 16A, 250V, IP44).", "a.add_spec": "Add specification", "a.upload_images": "Add images",
  "a.main_image": "Main", "a.move_first": "Move earlier", "a.move_last": "Move later", "a.adjust_stock": "Adjust stock", "a.delete_product_text": "Products that have been sold are archived instead of deleted so order history stays intact.",
  "a.archived_instead": "The product has sales history, so it was archived.", "a.ps.active": "Active", "a.ps.draft": "Draft", "a.ps.archived": "Archived",

  // inventory
  "a.inventory_sub": "Every change is recorded with who made it and why.", "a.stock_history": "Stock history", "a.inv_products": "Products", "a.inv_units": "{n} units in stock",
  "a.inv_value": "Stock value at cost", "a.inv_out": "Out of stock", "a.inv_scan_ph": "Scan a barcode to adjust that product", "a.move_stock": "Stock in / out", "a.current_stock": "current stock {n}",
  "a.counted_qty": "Counted quantity", "a.stock_after": "Stock after this change: {n}", "a.unit_cost_hint": "Updates the product's purchase price", "a.mv_note_hint": "For example supplier invoice number or reason for the write-off",
  "a.stock_updated": "Stock updated", "a.st_ok": "In stock", "a.st_low": "Low", "a.st_out": "Out", "a.all_moves": "All movements",
  "a.mv.stock_in": "Stock in", "a.mv.stock_out": "Stock out", "a.mv.adjustment": "Stock count", "a.mv.sale": "Sale", "a.mv.return": "Return", "a.mv.cancellation": "Cancelled order",
  "a.labels_sub": "Print barcode labels for shelves and products.", "a.label_size": "Label size", "a.label_price": "Show price", "a.print_n_labels": "Print {n} labels", "a.label_copies": "Copies",
  "a.labels_empty": "No labels selected", "a.labels_empty_text": "Scan or search for the products you want labels for.",

  // customers, staff, tickets
  "a.customers_search": "Name, phone or email", "a.edit_customer": "Customer details", "a.account_status": "Account", "a.last_login": "Last sign-in",
  "a.users_sub": "Staff sign in here with their own account. Each role limits what they can see and change.", "a.add_user": "Add staff member", "a.edit_user": "Edit staff member", "a.roles": "Roles",
  "a.roles_intro": "A role is a set of permissions. Built-in roles cannot be deleted.", "a.new_password_optional": "New password (leave empty to keep)", "a.all_permissions": "All permissions",
  "a.reply": "Reply to the customer", "a.send_reply": "Send reply", "a.reply_sent": "Reply sent", "a.then_set": "Then set status to", "a.close_ticket": "Close request",
  "a.ts.open": "Open", "a.ts.pending": "Waiting for customer", "a.ts.resolved": "Resolved", "a.ts.closed": "Closed",

  // payments, returns, invoices, reviews
  "a.gateway_off": "Online payment gateway: not configured", "a.gateway_on": "Online payment gateway: {name}",
  "a.pay.pending": "Pending", "a.pay.paid": "Paid", "a.pay.failed": "Failed", "a.pay.cancelled": "Cancelled", "a.pay.refunded": "Refunded", "a.pay.partially_refunded": "Partly refunded",
  "a.returns_sub": "Approve the request, receive the goods, then refund.", "a.ret.approve": "Approve", "a.ret.reject": "Reject", "a.ret.receive": "Mark received", "a.ret.refund": "Refund",
  "a.ret.approve_text": "The customer will be asked to send the items back.", "a.ret.reject_text": "The request is closed without a refund.", "a.ret.receive_text": "The order is marked as returned.",
  "a.ret.refund_text": "Online payments are refunded through the payment gateway. Orders paid in cash are refunded by you directly. A credit note is issued either way.", "a.ret.refund_hint": "Returned items are worth {items} SAR. The order total was {total} SAR.",
  "a.invoices_search": "Invoice or order number", "a.zatca_phase1": "Invoices include the ZATCA QR code and are stored with their UBL XML and hash chain. Reporting to ZATCA (Phase 2) is off until the integration is configured.",
  "a.zatca_ready": "ZATCA integration is active ({env}).", "a.zatca_submit": "Send to ZATCA",
  "a.z.not_submitted": "Not sent", "a.z.queued": "Queued", "a.z.reported": "Reported", "a.z.cleared": "Cleared", "a.z.warning": "Accepted with warnings", "a.z.rejected": "Rejected", "a.z.error": "Error",
  "a.reviews_sub": "Only approved reviews are shown in the store.", "a.approve": "Approve", "a.reject": "Reject", "a.rv.pending": "Waiting", "a.rv.approved": "Approved", "a.rv.rejected": "Rejected",

  // marketing & content intros
  "a.categories_intro": "Categories can be nested to any depth. The icon is used when a product has no photo.", "a.coupons_intro": "Codes customers type at checkout.",
  "a.discounts_intro": "Automatic price reductions on all products, a category, a brand or one product. The lowest price always wins.", "a.banners_intro": "The hero banner opens the homepage; promo banners appear between product rows.",
  "a.homepage_intro": "Choose which sections appear on the homepage and in what order.", "a.pages_intro": "Legal and information pages. Use “## ” for headings and “- ” for list items.",
  "a.shipping_intro": "Delivery methods offered at checkout.", "a.shipping_rates": "Regional rates", "a.shipping_rates_intro": "Override the fee or lead time for a region or city, or switch a method off there.", "a.cities": "Cities",
  "a.t.percent": "Percentage", "a.t.fixed": "Fixed amount", "a.t.free_shipping": "Free delivery", "a.t.all_products": "All products", "a.t.category": "Category", "a.t.brand": "Brand", "a.t.product": "Product",
  "a.t.hero": "Hero", "a.t.promo": "Promo",
  "a.sec.hero": "Hero banner", "a.sec.categories": "Categories", "a.sec.featured": "Featured products", "a.sec.best_sellers": "Best sellers", "a.sec.new_arrivals": "New arrivals", "a.sec.deals": "Offers",
  "a.sec.brands": "Brands", "a.sec.promo": "Promo banners", "a.sec.reviews": "Customer reviews", "a.sec.why_us": "Why choose us", "a.sec.delivery": "Delivery information", "a.sec.contact": "Contact",

  // reports
  "a.rep_sub": "Choose a period, then export to Excel, CSV or PDF.", "a.rep_range": "{from} to {to}", "a.rep.sales": "Sales", "a.rep.products": "Best sellers", "a.rep.profit": "Profit", "a.rep.customers": "Customers",
  "a.rep.vat": "VAT", "a.rep.inventory": "Inventory", "a.rep.invoices": "Invoices", "a.rep_group": "Group by", "a.rep_daily": "Daily", "a.rep_monthly": "Monthly", "a.rep_total": "Sales incl. VAT",
  "a.rep_by_method": "By payment method", "a.rep_by_city": "By city", "a.rep_excl_vat": "excluding VAT", "a.rep_profit_note": "Gross profit = revenue excluding VAT minus the purchase cost recorded when each item was sold. Delivery income and running costs are not included.",
  "a.rep_vat_note": "Output VAT by tax month, built from issued invoices and credit notes. Use it to prepare the VAT return; purchases (input VAT) are not tracked here.", "a.no_invoices_yet": "No invoices issued yet",

  // settings
  "a.settings_sub": "Changes apply to the store within a minute.", "a.sg.store": "Store", "a.sg.tax": "Tax", "a.sg.checkout": "Checkout", "a.sg.numbering": "Numbering", "a.sg.reviews": "Reviews",
  "a.sg.notifications": "Notifications", "a.sg.seo": "SEO", "a.sg.integrations": "Integrations",
  "a.s.store_name": "Store name", "a.s.legal_name": "Legal name on invoices", "a.s.legal_name_hint": "As written in the VAT certificate", "a.s.tagline": "Tagline", "a.s.phone": "Phone",
  "a.s.whatsapp": "WhatsApp number", "a.s.whatsapp_hint": "International format, for example 9665XXXXXXXX. Shows the WhatsApp button.", "a.s.city_ar": "City (Arabic)", "a.s.city_en": "City (English)",
  "a.s.additional_no": "Additional number", "a.s.hours": "Working hours", "a.s.vat_rate": "Standard VAT rate (%)", "a.s.vat_rate_hint": "Applied to delivery fees and used as the default for new products",
  "a.s.tax_note": "Product prices are entered and shown including VAT. Each product keeps its own VAT rate (15% or 0%).", "a.s.guest_checkout": "Allow checkout without an account",
  "a.s.cod_enabled": "Offer cash on delivery", "a.s.cod_fee": "Cash on delivery fee", "a.s.cod_max": "Largest order for cash on delivery", "a.s.cod_max_hint": "Orders above this must be paid online",
  "a.s.auto_confirm": "Confirm cash-on-delivery orders automatically", "a.s.auto_confirm_hint": "When off, each order waits for staff to confirm it", "a.s.unpaid_ttl": "Minutes to hold stock for an unpaid online order",
  "a.s.unpaid_ttl_hint": "After this the order is cancelled and the stock released", "a.s.recovery_hours": "Hours before the abandoned-cart reminder", "a.s.recovery_hint": "Sent once per cart when the email is known",
  "a.s.max_qty": "Largest quantity per product in one order", "a.s.order_prefix": "Order number prefix", "a.s.prefix_hint": "Up to 6 capital letters or digits", "a.s.invoice_prefix": "Invoice number prefix",
  "a.s.credit_prefix": "Credit note prefix", "a.s.auto_approve": "Publish reviews without moderation", "a.s.auto_approve_hint": "When off, reviews wait for approval", "a.s.verified_only": "Only customers who bought the product can review it",
  "a.s.admin_email": "Email for new-order alerts", "a.s.admin_email_hint": "Leave empty to use in-panel notifications only", "a.s.admin_phone": "Phone for alerts", "a.s.send_sms": "Send SMS to customers",
  "a.s.send_whatsapp": "Send WhatsApp messages to customers",
  "a.integ_intro": "These services are connected with environment variables on the server (see the deployment guide). This page shows what is active.", "a.integ_on": "Active", "a.integ_off": "Not configured",
  "a.integ.payment": "Online payment", "a.integ.payment_d": "mada, cards, Apple Pay and STC Pay through the payment gateway", "a.integ.email": "Email", "a.integ.email_d": "Order confirmations, password resets and alerts",
  "a.integ.sms": "SMS", "a.integ.sms_d": "Order updates by text message", "a.integ.whatsapp": "WhatsApp", "a.integ.whatsapp_d": "Order updates by WhatsApp", "a.integ.storage": "Image storage",
  "a.integ.storage_d": "Where product images are kept (local disk or an S3-compatible bucket)", "a.integ.zatca": "ZATCA e-invoicing", "a.integ.zatca_d": "Phase 2 reporting and clearance",

  // logs & notifications
  "a.logs_sub": "Who changed what, and when.", "a.logs_search": "User, action or record number", "a.notif_sub": "Alerts for staff and the log of messages sent to customers.", "a.notif_none": "No notifications yet",
  "a.nc.admin": "Staff alerts", "a.nc.email": "Email", "a.nc.sms": "SMS", "a.nc.whatsapp": "WhatsApp", "a.ns.queued": "Queued", "a.ns.sent": "Sent", "a.ns.failed": "Failed", "a.ns.skipped": "Not sent",

  // field labels
  "a.f.name": "Name", "a.f.title": "Title", "a.f.subtitle": "Subtitle", "a.f.description": "Description", "a.f.slug": "URL name", "a.f.slug_hint": "Lowercase English letters and dashes. Leave empty to generate.",
  "a.f.icon": "Icon", "a.f.image": "Image", "a.f.logo": "Logo", "a.f.parent": "Parent category", "a.f.sort": "Order", "a.f.active": "Active", "a.f.popular": "Show on homepage",
  "a.f.popular_hint": "Listed in the homepage brands section", "a.f.code": "Code", "a.f.type": "Type", "a.f.value": "Value", "a.f.max_discount": "Largest discount", "a.f.min_subtotal": "Minimum cart total",
  "a.f.usage_limit": "Total uses allowed", "a.f.per_customer": "Uses per customer", "a.f.blank_unlimited": "Leave empty for no limit", "a.f.note": "Note", "a.f.starts": "Starts", "a.f.ends": "Ends", "a.f.used": "Used",
  "a.f.scope": "Applies to", "a.f.scope_target": "Which one", "a.f.placement": "Position", "a.f.link": "Link", "a.f.link_hint": "A path such as /c/breakers or /products?flag=deals", "a.f.cta": "Button text",
  "a.f.section": "Section", "a.f.item_limit": "Items shown", "a.f.title_default": "Leave empty to use the standard title", "a.f.body": "Page text", "a.f.body_hint": "“## ” starts a heading, “- ” a list item, an empty line a new paragraph",
  "a.f.updated": "Updated", "a.f.question": "Question", "a.f.answer": "Answer", "a.f.key": "Key", "a.f.carrier": "Courier", "a.f.base_fee": "Fee", "a.f.free_threshold": "Free above",
  "a.f.free_threshold_hint": "Cart total from which this method is free. Empty = never free.", "a.f.min_days": "Fastest (days)", "a.f.max_days": "Slowest (days)", "a.f.days": "Days", "a.f.cod_allowed": "Cash on delivery",
  "a.f.is_pickup": "Pick-up from the shop", "a.f.is_pickup_hint": "Offered only in cities that have a rate row for this method", "a.f.method": "Delivery method", "a.f.region": "Region", "a.f.city": "City",
  "a.f.city_hint": "Choose a city to override just that city", "a.f.fee": "Fee", "a.f.available": "Available", "a.f.available_hint": "Untick to block this method for the destination", "a.f.destination": "Destination",
  "a.f.permissions": "Permissions", "a.f.system": "Built-in", "a.f.order": "Order", "a.f.customer": "Customer", "a.f.units": "Units", "a.f.payment": "Payment", "a.f.status": "Status", "a.f.channel": "Channel",
  "a.f.product": "Product", "a.f.unit_price": "Unit price", "a.f.stock_now": "In stock now", "a.f.amount": "Amount", "a.f.tracking_url": "Tracking link", "a.f.category": "Category", "a.f.brand": "Brand",
  "a.f.price": "Price", "a.f.stock": "Stock", "a.f.sold": "Sold", "a.f.featured": "Featured", "a.f.is_new": "Mark as new", "a.f.best_seller": "Best seller", "a.f.barcode_hint": "EAN-13 or any code your scanner reads",
  "a.f.selling_price": "Selling price", "a.f.discount_price": "Discount price", "a.f.purchase_price": "Purchase price", "a.f.vat_rate": "VAT rate", "a.f.spec_label": "Label", "a.f.spec_value": "Value",
  "a.f.video": "Product video", "a.f.video_hint": "A YouTube or Vimeo link, or upload an MP4 / WebM file up to 60 MB", "a.f.seo_title": "Page title", "a.f.seo_description": "Search description", "a.f.keywords": "Search keywords",
  "a.f.keywords_hint": "Other words customers use for this product, in any language", "a.f.initial_stock": "Opening stock", "a.f.min_stock": "Minimum stock", "a.f.min_stock_hint": "You are alerted when stock falls to this level",
  "a.f.location": "Shelf / location", "a.f.location_hint": "Where the item is kept in the shop or warehouse", "a.f.weight_g": "Weight (grams)", "a.f.length_mm": "Length (mm)", "a.f.width_mm": "Width (mm)",
  "a.f.height_mm": "Height (mm)", "a.f.warranty_months": "Warranty (months)", "a.f.stock_value": "Value at cost", "a.f.unit_cost": "Unit cost", "a.f.date": "Date", "a.f.change": "Change", "a.f.balance": "Balance",
  "a.f.reference": "Reference", "a.f.user": "User", "a.f.contact": "Contact", "a.f.spent": "Total spent", "a.f.since": "Customer since", "a.f.role": "Role", "a.f.messages": "Messages", "a.f.provider": "Provider",
  "a.f.refunded": "Refunded", "a.f.review": "Review", "a.f.period": "Period", "a.f.revenue": "Revenue", "a.f.cost": "Cost", "a.f.profit": "Gross profit", "a.f.margin": "Margin", "a.f.last_order": "Last order",
  "a.f.tax_month": "Tax month", "a.f.sales_taxable": "Sales excl. VAT", "a.f.output_vat": "Output VAT", "a.f.credit_vat": "Credit notes VAT", "a.f.net_taxable": "Net taxable", "a.f.net_vat": "Net VAT due",
  "a.f.action": "Action", "a.f.entity": "Record", "a.f.details": "Details", "a.f.event": "Event", "a.f.recipient": "Recipient", "a.f.message": "Message",

  // permissions
  "perm.dashboard.view": "See the dashboard", "perm.orders.view": "See orders", "perm.orders.manage": "Change order status", "perm.pos.use": "Make counter sales", "perm.products.view": "See products",
  "perm.products.manage": "Add and edit products", "perm.catalog.manage": "Manage categories and brands", "perm.inventory.view": "See inventory", "perm.inventory.manage": "Adjust stock",
  "perm.customers.view": "See customers", "perm.customers.manage": "Edit customers", "perm.promotions.manage": "Manage discounts and codes", "perm.reviews.manage": "Moderate reviews",
  "perm.payments.view": "See payments", "perm.payments.refund": "Record payments and refunds", "perm.shipping.manage": "Manage shipping", "perm.returns.manage": "Handle returns",
  "perm.invoices.view": "See invoices", "perm.reports.view": "See reports", "perm.content.manage": "Manage banners and pages", "perm.settings.manage": "Change settings",
  "perm.tickets.manage": "Answer support requests", "perm.users.manage": "Manage staff and roles", "perm.logs.view": "See the activity log",
};
