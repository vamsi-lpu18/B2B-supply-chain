# Frontend UI Implementation - Complete Guide

## Overview

This document provides a comprehensive breakdown of what's actually implemented in the Angular 21 frontend UI, showing what each page displays, what features are available, and how users interact with the system.

---

## Table of Contents

1. [Application Shell & Navigation](#application-shell--navigation)
2. [Authentication Pages](#authentication-pages)
3. [Dashboard](#dashboard)
4. [Product Catalog](#product-catalog)
5. [Shopping Cart](#shopping-cart)
6. [Orders Management](#orders-management)
7. [Shipment Tracking](#shipment-tracking)
8. [Invoice Management](#invoice-management)
9. [Admin Features](#admin-features)
10. [Notifications](#notifications)
11. [User Profile](#user-profile)

---

## Application Shell & Navigation

### Main Layout (AppShellComponent)

**What it looks like:**
- Modern, responsive layout with collapsible sidebar navigation
- Top navigation bar with breadcrumbs, search, and user actions
- Mobile-responsive with bottom navigation bar on small screens
- Floating chatbot button for operations assistance

**Key Features:**

1. **Sidebar Navigation**
   - Logo and branding at top
   - Grouped navigation items (Overview, Catalog, Operations, Finance, System)
   - Expandable/collapsible groups
   - Active route highlighting
   - Badge indicators (cart count, pending orders)
   - Collapse button to minimize sidebar

2. **Top Bar**
   - Breadcrumb navigation showing current section and page
   - Global search input (placeholder for future implementation)
   - Today's date chip
   - Cart icon with item count badge (for dealers)
   - Notifications bell icon
   - User profile dropdown

3. **Profile Menu**
   - User avatar with initials
   - Full name and role display
   - "View Profile" link
   - "Logout" button

4. **Operations Chatbot (Ops Concierge)**
   - Floating action button (FAB) with gradient blue styling
   - Animated floating effect
   - Opens chat panel when clicked
   - Chat interface with:
     - Bot and user message bubbles
     - Intent labels on bot messages
     - Typing indicator during loading
     - Suggested prompts as quick actions
     - Text input with "Ask" button
   - Can answer questions about:
     - Shipment status and delays
     - Delivery retries
     - Assignment gaps
     - Current date/time
     - Cart summary

5. **Mobile Navigation**
   - Fixed bottom bar with 5 most important routes
   - Icon + label for each item
   - Badge indicators
   - Active state highlighting

**Role-Based Navigation:**
- **Dealer**: Dashboard, Products, Cart, My Orders, Shipments, Invoices, Notifications
- **Admin**: Dashboard, Products, All Orders, Shipments, Invoices, Notifications, Dealers, Create Agent
- **Warehouse**: Dashboard, Products, All Orders, Notifications
- **Logistics**: Dashboard, All Orders, Shipments, Notifications
- **Agent**: Dashboard, Shipments, Notifications

---

## Authentication Pages

### Login Page (LoginComponent)

**What it looks like:**
- Full-screen layout with video background
- Centered login card with glass-morphism effect
- SupplyChain branding and logo
- Clean, modern form design

**Features:**
- Email input field
- Password input field with show/hide toggle
- "Remember me" checkbox
- "Login" button with loading state
- "Register as Dealer" link
- Form validation with error messages
- Auto-redirect after successful login based on role

**User Experience:**
- Video background creates professional atmosphere
- Real-time validation feedback
- Loading spinner during authentication
- Error messages displayed inline
- Smooth transitions and animations

### Dealer Registration Page (RegisterComponent)

**What it looks like:**
- Multi-step registration form
- Progress indicator showing current step
- Clean, organized layout with sections

**Form Fields:**
- Full Name
- Email
- Password (with strength indicator)
- Confirm Password
- Business Name
- GST Number
- Business Address
- City
- State
- Pincode
- Phone Number

**Features:**
- Real-time validation
- Password strength meter
- GST number format validation
- Form submission with loading state
- Success message and redirect to login
- "Already have an account? Login" link

---

## Dashboard

### Dashboard Page (DashboardComponent)

**What it looks like:**
- Control tower style interface
- Welcome header with user name and current date
- 4 stat cards showing key metrics
- Two-column grid layout (tables on left, charts/actions on right)
- Modern card-based design with shadows and hover effects

**Stat Cards (Role-Specific):**

**For Dealers:**
1. Available Credit (₹ amount of ₹ limit)
2. My Orders (count, "All time")
3. Cart Items (count, total amount)
4. Shipments (count, "Active")

**For Admins:**
1. Total Orders (count with trend %)
2. Active Shipments (count, "In transit")
3. Products (count, "In catalog")
4. Active Dealers (count, "Buying in last 90 days")

**For Warehouse:**
1. Orders (count, "Fulfillment queue")
2. Low Stock Alerts (count with threshold)

**Left Column - Data Tables:**

1. **Recent Orders Table**
   - Order Number
   - Status badge (color-coded)
   - Amount (₹)
   - Date
   - "View" link
   - Shows last 8 orders
   - "View all →" link to orders page

2. **Products Table**
   - Product thumbnail image
   - Product name
   - SKU
   - Price (₹)
   - Stock status badge (In stock/Low/Out of stock)
   - "View" link
   - Shows 8 products
   - "Browse all →" link

3. **Shipments Table** (for Logistics/Agent/Dealer)
   - Shipment Number
   - Status badge
   - City
   - Created date
   - "Track" link
   - Shows 8 shipments
   - "Track all →" link

**Right Column - Charts & Actions:**

1. **Order Status Pie Chart**
   - Circular SVG chart with colored segments
   - Center shows total order count
   - Legend below with:
     - Color dot
     - Status label
     - Count
     - Progress bar showing percentage
   - Categories: Placed, Processing, In Transit, Delivered, Cancelled

2. **Purchase Insights Panel** (Admin/Warehouse/Logistics)
   - Last 90 days analytics
   - Summary grid showing:
     - Revenue (₹)
     - Average Order Value (₹)
     - Active Dealers (count)
     - Units Sold (count)
   - Two lists side-by-side:
     - **Top Dealers**: Name, order count, total amount
     - **Top Products**: Name, units sold, SKU, revenue

3. **Inventory Alerts Panel** (Admin/Warehouse)
   - Low stock threshold input (adjustable 1-999)
   - "Include out-of-stock products" checkbox
   - Summary cards:
     - Low Stock count
     - Out of Stock count
     - Critical count (below half threshold)
   - Alert list showing:
     - Product name
     - Stock status badge
     - Click to view product details
   - Shows top 6 alerts

4. **Quick Actions Panel**
   - List of clickable action cards
   - Each card shows:
     - Colored icon
     - Action name
     - Description
     - Arrow indicator
   
   **Dealer Actions:**
   - Browse Products
   - View Cart (with item count)
   - My Orders
   - Track Shipments
   - Invoices
   
   **Admin Actions:**
   - Manage Dealers
   - Add Product
   - All Orders
   - Notifications
   
   **Warehouse Actions:**
   - Process Orders
   - Inventory
   
   **Logistics/Agent Actions:**
   - My Deliveries
   - Orders (Logistics only)

**Product Images:**
- Displays product images with fallback handling
- Uses enterprise image service with SKU-based URLs
- Generates placeholder images if real images fail to load
- Placeholder shows product name and SKU on colored background

---

## Product Catalog

### Product List Page (ProductListComponent)

**What it looks like:**
- Grid layout of product cards
- Filter bar at top
- Pagination at bottom
- Empty state when no products found

**Filter Options:**
- Search by name/SKU (text input)
- Category dropdown (All, Electronics, Furniture, etc.)
- Stock status (All, In Stock, Low Stock, Out of Stock)
- Price range (min/max inputs)
- "Reset" button to clear filters

**Product Card Display:**
- Product image (220x220px)
- Product name
- SKU
- Price (₹)
- Stock status badge
- Min order quantity
- Available stock count
- "View Details" button
- "Quick Add to Cart" button (for dealers)
  - Quantity input
  - Add button
  - Respects min order quantity

**Features:**
- Real-time search filtering
- Client-side filtering for better UX
- Pagination (20 items per page)
- Loading skeletons during data fetch
- Image fallback handling
- Quick add to cart without leaving page
- Toast notifications for actions

**Empty State:**
- Icon (📦)
- "No products found" message
- Helpful text based on context

### Product Detail Page (ProductDetailComponent)

**What it looks like:**
- Two-column layout
- Left: Large product image
- Right: Product information and actions
- Tabs for additional information

**Product Information:**
- Product name (large heading)
- SKU
- Category badge
- Price (₹, large and prominent)
- Stock status badge
- Available stock count
- Min order quantity
- Product description
- Active/Inactive status

**Actions (for Dealers):**
- Quantity input (respects min order qty)
- "Add to Cart" button
- Validation messages

**Actions (for Admin/Warehouse):**
- "Edit Product" button
- "Restock" button (opens dialog)
- "Deactivate/Activate" button

**Restock Dialog:**
- Current stock display
- Quantity to add input
- "Confirm" button
- Updates stock immediately

**Edit Mode (Admin/Warehouse):**
- Inline form with all fields editable
- Image URL input
- Name, description, category
- Price, min order qty
- "Save Changes" button
- "Cancel" button

---

## Shopping Cart

### Cart Page (CartComponent)

**What it looks like:**
- List of cart items
- Summary card on the right (desktop) or bottom (mobile)
- Empty state when cart is empty

**Cart Item Display:**
- Product image thumbnail
- Product name
- SKU
- Unit price (₹)
- Quantity controls:
  - Decrease button (-)
  - Quantity input
  - Increase button (+)
- Line total (₹)
- "Remove" button
- Optional notes textarea

**Cart Summary Card:**
- Subtotal (₹)
- Item count
- "Proceed to Checkout" button
- "Continue Shopping" link

**Features:**
- Real-time quantity updates
- Automatic line total calculation
- Min order quantity validation
- Stock availability validation
- Notes per item (optional)
- Remove items with confirmation
- Toast notifications for all actions
- Persists in localStorage

**Checkout Process:**
- Payment mode selection (COD/PrePaid)
- Delivery address (pre-filled from profile)
- Order review
- "Place Order" button
- Loading state during submission
- Success message and redirect to order detail

**Empty State:**
- Icon (🛒)
- "Your cart is empty" message
- "Start Shopping" button

---

## Orders Management

### Order List Page (OrderListComponent)

**What it looks like:**
- Data table with multiple columns
- Filter bar at top
- Bulk action toolbar (for Admin/Logistics)
- Pagination at bottom
- Summary cards showing counts

**Filters:**
- Status dropdown (All, Placed, Processing, etc.)
- SLA filter (All, On Track, At Risk, Delayed, Closed)
- Search by order number
- Dealer ID search (for non-dealers)
- Date range (from/to)
- "Reset" button

**Summary Cards:**
- Visible Invoices count
- Action Required count
- Overdue Amount (₹)
- Selected Amount (₹)
- Follow-up Due count

**Table Columns:**
- Checkbox (for bulk selection)
- Order Number
- Dealer ID (for non-dealers)
- Status (visual pipeline with dots and bars)
- SLA badge (On Track/At Risk/Delayed)
- Expected delivery date/time
- Total Amount (₹)
- Placed At date/time
- Actions (View, Track buttons)

**Status Pipeline Visualization:**
- 5 stages: Placed → Process → Dispatch → Transit → Delivered
- Dots and connecting bars
- Completed stages: filled
- Active stage: highlighted
- Future stages: gray
- Cancelled: red cross on first stage

**Bulk Actions (Admin/Logistics):**
- Select all visible checkbox
- "Select All Matching" button (up to 1000 orders)
- "Clear Selection" button
- Status dropdown for bulk update
- "Validate Selection" button (pre-check transitions)
- "Apply Bulk Status" button
- Shows validation results:
  - Valid count (green badge)
  - Invalid count (red badge)
  - Applied count (blue badge)
  - List of invalid items with reasons

**Features:**
- Client-side filtering for better UX
- Server-side pagination when no filters
- SLA calculation and display
- Bulk status updates with validation
- Export to CSV
- Role-based action visibility
- Toast notifications

**Empty State:**
- Icon (📋)
- "No orders found" message
- "Start Shopping" link (for dealers)

### Order Detail Page (OrderDetailComponent)

**What it looks like:**
- Header card with order summary
- Order items table
- Status history timeline
- Operations notes section (for staff)
- Return request section (if applicable)
- Action buttons at top

**Header Card:**
- Status badge (large, color-coded)
- Payment mode (COD/PrePaid)
- Credit Hold status
- Total Amount (₹, large and prominent)
- Placed At date/time
- Dealer ID
- Cancellation reason (if cancelled)

**Order Items Table:**
- Product name
- SKU
- Quantity
- Unit Price (₹)
- Line Total (₹)

**Status History Timeline:**
- Chronological list of status changes
- Each entry shows:
  - Date/time
  - Changed by role
  - From status → To status
- Visual timeline with connecting lines

**Operations Notes Section** (Admin/Warehouse/Logistics):
- Add internal note textarea
- Tags input (comma-separated)
- "Add Note" button
- List of existing notes showing:
  - Date/time and role
  - Tags as badges
  - Note text
  - "Remove" button

**Action Buttons (Role-Based):**

**For Dealers:**
- "Track Delivery" (if applicable)
- "Cancel Order" (if Placed or OnHold)
- "Request Return" (if Delivered, within 48 hours)
- "Reorder Items" (adds items back to cart)

**For Admin:**
- "Track Delivery"
- "Update Status" (opens dialog)
- "Cancel Order" (any non-closed status)
- "Approve Hold" (if OnHold)
- "Reject Hold" (if OnHold)

**For Logistics:**
- "Track Delivery"
- "Update Status" (limited to logistics-managed statuses)

**Dialogs:**

1. **Cancel Order Dialog:**
   - Reason textarea (required)
   - "Cancel Order" button
   - "Back" button

2. **Request Return Dialog:**
   - Shows expiry warning if window expired
   - Reason textarea (required)
   - "Submit Return" button
   - "Back" button

3. **Update Status Dialog:**
   - Status dropdown (shows only valid transitions)
   - "Update" button
   - "Cancel" button

4. **Reject Hold Dialog:**
   - Reason textarea
   - "Reject" button
   - "Cancel" button

**Return Request Display:**
- Reason
- Requested date
- Approval status badge
- "Approve Return" button (Admin)
- "Reject Return" button (Admin)

**Features:**
- Real-time status updates
- Return window validation (48 hours)
- Reorder functionality with stock validation
- Credit hold approval workflow
- Operations notes for internal tracking
- Role-based action visibility

---

## Shipment Tracking

### Shipment List Page (ShipmentListComponent)

**What it looks like:**
- Data table with shipment information
- Filter bar with multiple options
- Summary cards showing operational metrics
- Empty state when no shipments

**Filters:**
- Status dropdown (All, Created, Assigned, etc.)
- SLA filter (All, On Track, At Risk, Delayed, Exception, Delivered)
- Ops Queue filter (All, Handover Pending, Exception Queue, Retry Required)

**Summary Cards:**
- Visible Shipments count
- Handover Pending count
- Exceptions count (red, critical)
- Retry Required count (warning)

**Table Columns:**
- Shipment Number
- Order ID (truncated with ...)
- Status badge
- ETA date
- SLA badge (On Track/At Risk/Delayed)
- Ops Queue badges (multiple possible):
  - Handover Pending (yellow)
  - Exception (red)
  - Retry Required (blue)
- Delivery Address and City
- Created date
- "Track →" button

**Features:**
- Multi-filter support
- Real-time SLA calculation
- Operational queue detection
- Role-based data visibility:
  - Dealer: My shipments
  - Agent: Assigned shipments
  - Admin/Logistics: All shipments
- Empty state with helpful message

### Shipment Detail Page (ShipmentDetailComponent)

**What it looks like:**
- Header card with shipment summary
- Tracking timeline
- Assignment information
- Delivery details
- Action buttons

**Header Card:**
- Shipment Number
- Order ID (clickable link)
- Status badge
- ETA date/time
- SLA status badge
- Created date
- Tracking Number (if available)

**Tracking Timeline:**
- Visual timeline with milestones
- Each milestone shows:
  - Status name
  - Date/time
  - Location (if available)
  - Notes
- Current status highlighted
- Completed statuses: green checkmark
- Future statuses: gray

**Assignment Information:**
- Assigned Agent name and ID
- Vehicle Number
- Contact information
- Assignment date

**Delivery Details:**
- Delivery Address (full)
- City, State, Pincode
- Recipient name
- Contact number

**Action Buttons (Role-Based):**

**For Logistics:**
- "Assign Agent" (opens dialog)
- "Update Status" (opens dialog)
- "Add Tracking Note" (opens dialog)

**For Agent:**
- "Update Status" (limited options)
- "Mark Delivered" (if in transit)
- "Report Issue" (opens dialog)

**Dialogs:**

1. **Assign Agent Dialog:**
   - Agent dropdown (list of available agents)
   - Vehicle Number input
   - "Assign" button

2. **Update Status Dialog:**
   - Status dropdown (valid transitions only)
   - Notes textarea (optional)
   - "Update" button

3. **Report Issue Dialog:**
   - Issue type dropdown
   - Description textarea
   - "Submit" button

**Features:**
- Real-time tracking updates
- Agent assignment workflow
- Issue reporting
- Status history
- ETA calculation
- SLA monitoring

---

## Invoice Management

### Invoice List Page (InvoiceListComponent)

**What it looks like:**
- Data table with invoice information
- Extensive filter bar
- Bulk action toolbar (for Admin)
- Summary cards showing financial metrics
- Workflow management features

**Filters:**
- Search by invoice/order number
- GST Type (All, IGST, CGST/SGST)
- Date range (from/to)
- Amount range (min/max)
- Workflow status (All, Action Required, Overdue, Pending, etc.)
- Aging bucket (All, Current, 1-7 days, 8-15 days, 16+ days)

**Summary Cards:**
- Visible Invoices count
- Action Required count
- Overdue Amount (₹, red)
- Selected Amount (₹, blue)
- Follow-up Due count

**Table Columns:**
- Checkbox (for bulk selection)
- Invoice Number
- Order ID (truncated)
- GST Type badge
- Grand Total (₹)
- Due By date
- Aging badge (days past due)
- Workflow status badge
- Created date
- Action buttons

**Workflow Status Badges:**
- Pending (gray)
- Reminder Sent (blue)
- Promise To Pay (blue)
- Paid (green)
- Disputed (yellow)
- Escalated (red)
- Overdue (red)

**Aging Badges:**
- Current (green)
- 1-7 days (yellow)
- 8-15 days (red)
- 16+ days (red)

**Bulk Actions (Admin):**
- Select all visible checkbox
- "Clear" button
- "Bulk Reminder" button (shows eligible count)
- "Bulk Paid" button (shows eligible count)
- "Bulk Dispute" button (shows eligible count)
- "Bulk Escalate" button (shows eligible count)
- Shows selected count and amount

**Individual Actions (Admin):**
- "Reminder" button (sends payment reminder email)
- "Paid" button (marks as paid)
- "Dispute" button (moves to disputed workflow)
- "Escalate" button (escalates for collection)
- "View →" link

**Features:**
- Advanced filtering and search
- Workflow automation (auto-reminders, follow-ups)
- Bulk operations with eligibility checks
- Aging calculation
- Export to CSV
- Email notifications for reminders
- In-app notifications for escalations
- Promise-to-pay tracking
- Follow-up scheduling

**Empty State:**
- Icon (🧾)
- "No invoices found" message

**Admin-Specific:**
- Dealer ID input to load invoices for specific dealer
- "Load" button

### Invoice Detail Page (InvoiceDetailComponent)

**What it looks like:**
- Header card with invoice summary
- Line items table
- GST breakdown
- Workflow information
- Activity timeline
- Action buttons

**Header Card:**
- Invoice Number
- Order ID (clickable link)
- Dealer ID
- Invoice Date
- Due Date
- Payment Status badge
- Grand Total (₹, large)

**Line Items Table:**
- Product name
- SKU
- Quantity
- Unit Price (₹)
- Line Total (₹)

**GST Breakdown:**
- GST Type (IGST or CGST/SGST)
- GST Rate (%)
- Subtotal (₹)
- GST Amount (₹)
- Grand Total (₹)

**Workflow Information:**
- Current status badge
- Due date
- Days past due (if overdue)
- Reminder count
- Last reminder date
- Next follow-up date
- Promise to pay date (if set)
- Internal notes

**Activity Timeline:**
- Chronological list of workflow activities
- Each entry shows:
  - Date/time
  - Activity type
  - Description
  - Performed by role

**Action Buttons (Admin):**
- "Download PDF" (generates invoice PDF)
- "Send Reminder" (email notification)
- "Mark as Paid"
- "Mark as Disputed"
- "Escalate"
- "Set Promise to Pay" (opens dialog)
- "Add Internal Note" (opens dialog)

**Dialogs:**

1. **Promise to Pay Dialog:**
   - Date picker
   - Notes textarea
   - "Save" button

2. **Internal Note Dialog:**
   - Note textarea
   - "Add" button

**Features:**
- PDF generation with QuestPDF
- Email reminders
- Workflow state management
- Activity tracking
- Promise-to-pay scheduling
- Internal notes for collections team

---

## Admin Features

### Dealer List Page (DealerListComponent)

**What it looks like:**
- Data table with dealer information
- Search bar at top
- Pagination at bottom
- "Create Agent" button in header

**Search:**
- Text input for name or email search
- Debounced search (300ms delay)

**Table Columns:**
- Name
- Email
- Business Name
- GST Number
- Status badge (Active/Pending/Rejected)
- Credit Limit (₹)
- Registered date
- "View →" button

**Features:**
- Real-time search
- Pagination (20 per page)
- Status color coding
- Click row to view details

**Empty State:**
- Icon (👥)
- "No dealers found" message

### Dealer Detail Page (DealerDetailComponent)

**What it looks like:**
- Header card with dealer summary
- Business information section
- Credit information section
- Order history section
- Action buttons

**Header Card:**
- Full Name
- Email
- Status badge (large)
- Registered date
- User ID

**Business Information:**
- Business Name
- GST Number
- Address (full)
- City, State, Pincode
- Phone Number

**Credit Information:**
- Credit Limit (₹)
- Available Credit (₹)
- Credit Used (₹)
- Credit utilization percentage bar

**Order History:**
- Total orders count
- Total revenue (₹)
- Average order value (₹)
- Last order date
- Link to view all orders

**Action Buttons (Admin):**
- "Approve" (if Pending)
- "Reject" (if Pending, opens dialog)
- "Update Credit Limit" (opens dialog)
- "Deactivate/Activate"
- "View Orders"
- "View Invoices"

**Dialogs:**

1. **Reject Dealer Dialog:**
   - Reason textarea (required)
   - "Reject" button

2. **Update Credit Limit Dialog:**
   - Current limit display
   - New limit input (₹)
   - "Update" button

**Features:**
- Dealer approval workflow
- Credit limit management
- Order and invoice access
- Status management

### Create Agent Page (CreateAgentComponent)

**What it looks like:**
- Form layout with sections
- Clean, organized design

**Form Fields:**
- Full Name (required)
- Email (required)
- Password (required)
- Confirm Password (required)
- Phone Number (required)
- Vehicle Number (optional)
- License Number (optional)

**Features:**
- Form validation
- Password strength indicator
- Email format validation
- Phone number format validation
- "Create Agent" button with loading state
- Success message and redirect

---

## Notifications

### Notifications Page (NotificationsComponent)

**What it looks like:**
- List of notification cards
- Filter tabs at top
- Mark all as read button
- Empty state when no notifications

**Filter Tabs:**
- All
- Unread
- Email
- SMS
- In-App

**Notification Card:**
- Icon based on channel (📧 Email, 📱 SMS, 🔔 In-App)
- Title (bold)
- Body text
- Timestamp (relative, e.g., "2 hours ago")
- Unread indicator (blue dot)
- "Mark as Read" button (if unread)
- "Delete" button

**Features:**
- Filter by channel
- Filter by read/unread status
- Mark individual as read
- Mark all as read
- Delete notifications
- Real-time updates
- Pagination

**Empty State:**
- Icon (🔔)
- "No notifications" message
- Helpful text based on filter

---

## User Profile

### Profile Page (ProfileComponent)

**What it looks like:**
- Two-column layout
- Left: Profile information
- Right: Change password form

**Profile Information:**
- Avatar with initials
- Full Name
- Email
- Role badge
- User ID
- Registered date

**For Dealers:**
- Business Name
- GST Number
- Address
- City, State, Pincode
- Phone Number
- Credit Limit (₹)
- Available Credit (₹)

**Change Password Form:**
- Current Password input
- New Password input
- Confirm New Password input
- Password strength indicator
- "Change Password" button

**Features:**
- View profile information
- Change password
- Password strength validation
- Success/error notifications

---

## Common UI Patterns

### Loading States
- Skeleton loaders for tables and cards
- Spinner for buttons during actions
- Loading bar at top of page
- Shimmer effect on skeletons

### Empty States
- Large icon (emoji)
- Title message
- Optional description
- Call-to-action button (when applicable)

### Toast Notifications
- Success (green, checkmark icon)
- Error (red, X icon)
- Warning (yellow, exclamation icon)
- Info (blue, info icon)
- Auto-dismiss after 5 seconds
- Positioned at top-right
- Stacked when multiple

### Modals/Dialogs
- Backdrop overlay (semi-transparent)
- Centered modal card
- Header with title and close button
- Body with content
- Footer with action buttons
- Click outside to close
- ESC key to close

### Badges
- Color-coded by status/type
- Rounded corners
- Small text
- Consistent sizing
- Semantic colors:
  - Success: green
  - Warning: yellow
  - Error: red
  - Info: blue
  - Neutral: gray

### Buttons
- Primary: Blue gradient, white text
- Secondary: Gray border, gray text
- Ghost: Transparent, colored text
- Danger: Red, white text
- Sizes: sm, md (default), lg
- Loading state: spinner + disabled
- Disabled state: reduced opacity

### Form Controls
- Text inputs with border
- Focus state: blue ring
- Error state: red border + message
- Label above input
- Placeholder text
- Required indicator (*)
- Help text below input

### Tables
- Striped rows (alternating background)
- Hover effect on rows
- Clickable rows (cursor pointer)
- Sortable columns (future)
- Sticky header (on scroll)
- Responsive (horizontal scroll on mobile)
- Loading skeleton during fetch

### Cards
- White background
- Border and shadow
- Rounded corners
- Padding inside
- Hover effect (lift + shadow)
- Consistent spacing

---

## Responsive Design

### Breakpoints
- Mobile: < 768px
- Tablet: 768px - 1060px
- Desktop: > 1060px

### Mobile Adaptations
- Sidebar becomes slide-out drawer
- Bottom navigation bar appears
- Tables scroll horizontally
- Cards stack vertically
- Reduced padding and margins
- Larger touch targets
- Simplified layouts

### Tablet Adaptations
- Sidebar remains visible
- Two-column layouts may stack
- Reduced spacing
- Optimized for touch

---

## Accessibility Features

- Semantic HTML elements
- ARIA labels and roles
- Keyboard navigation support
- Focus indicators
- Screen reader friendly
- Color contrast compliance
- Alt text for images
- Form labels and associations

---

## Performance Optimizations

- Lazy loading of routes
- Image lazy loading
- Virtual scrolling (future)
- Debounced search inputs
- Client-side filtering when possible
- Pagination for large datasets
- Signal-based reactivity (Angular 21)
- Standalone components (smaller bundles)

---

## Summary

The frontend provides a complete, production-ready UI for all user roles with:

- **29+ pages/components** fully implemented
- **Role-based access control** throughout
- **Real-time updates** using Angular signals
- **Responsive design** for all screen sizes
- **Professional UI/UX** with modern design patterns
- **Comprehensive features** for supply chain management
- **Accessibility** and performance optimizations

Every page is functional, connected to backend APIs, and provides a smooth user experience for dealers, admins, warehouse staff, logistics personnel, and delivery agents.
