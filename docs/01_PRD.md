# 01_PRD: AI_ERP_POS

## Core Problem

Cloud-dependent POS systems lag during barcode scanning and fail during internet outages, disrupting retail checkouts.

## Target Persona

- Retail cashiers who need uninterrupted scanning and keyboard shortcuts.
- IT managers and admins who need centralized multi-branch inventory and a predictable deployment.

## MVP User Stories

- As a cashier, I can scan a barcode and add it to the cart in under 50ms from local storage, with no network call on the scan path.
- As a cashier, I can complete a sale offline. The terminal keeps the invoice in a local outbox and syncs it in the background when the network returns.
- As an admin, I can manage inventory across branches from one system, while each terminal only receives the catalog for a branch it is allowed to sell.

## Success Metrics

- Barcode to cart addition time: < 50ms.
- 100% of offline checkouts are preserved locally until background sync succeeds.

## Out of Scope (Non-Goals for MVP)

- E-commerce storefront.
- HR and payroll.
