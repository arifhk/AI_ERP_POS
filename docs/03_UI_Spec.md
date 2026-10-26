# 03_UI_Spec: Design System

## Stack

React and Tailwind CSS.

## Theming

Dark mode uses the Slate palette:

- Page background: `#0f172a` (Slate 900).
- Panels, tables, and headers: `#1e293b` (Slate 800).
- Primary accent: blue / indigo for the active control.
- Text: high-contrast white and gray.

## Typography and Spacing

Checkout is dense. Use compact Tailwind spacing (`p-2`, `gap-2`, `px-3`, `py-2`). Cart tables keep a fixed header so the line list can scroll.

## Sync Status Badges

- **Cached count** — number of rows in the local Dexie `products` table.
- **Idle / ready** — neutral slate badge after a successful sync.
- **Syncing** — blue badge while `/api/products` is in flight.
- **Offline** — red badge when the sync request fails. Scanning the cached catalog still works.
