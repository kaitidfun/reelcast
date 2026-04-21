

## Goal
Redesign `src/pages/ContentLibrary.tsx` (route `/library`) into a **2-level hierarchy**: Campaigns → Products, with a slide-over drawer for adding products. Replace the current flat grid/list view entirely. Keep the premium dark theme and floating content block aesthetic.

---

## State Machine
Single component, internal state:
```ts
const [openCampaignId, setOpenCampaignId] = useState<string | null>(null);
const [isAddProductOpen, setIsAddProductOpen] = useState(false);
const [search, setSearch] = useState("");
const [statusFilter, setStatusFilter] = useState<"all" | "Active" | "Draft">("all");
```
- `openCampaignId === null` → **State 1 (Campaigns view)**
- `openCampaignId !== null` → **State 2 (Inside Campaign view)**

---

## Mock Data Shape
Restructure existing mocks into nested campaigns:
```ts
type Product = { id, name, keyPoints, affiliateLink, status: "Active" | "Draft", thumbnail };
type Campaign = { id, name, products: Product[], reelsCount };
```
Seed 4 campaigns: "Summer Sale 2026", "Accessories Launch", "Beauty Week", "Tech Deals" — each with 3–6 products derived from the existing mock list.

---

## State 1 — Campaigns View

**Header row** (`flex justify-between`):
- Left: `<h1>` "Campaigns & Products" + subtitle "Organize products by marketing campaign".
- Right: `Button` `+ New Campaign` (gradient-primary, `Plus` icon).

**Grid**: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5`.

**Folder-style Campaign Card** (motion.div, clickable):
- `rounded-2xl border border-border bg-card p-6 card-shine hover:border-primary/30 hover:shadow-elevated cursor-pointer`.
- Top: large `FolderOpen` icon in a gradient tile (`h-12 w-12 rounded-xl gradient-primary shadow-glow`), with a small "tab" pseudo-element above for folder feel (`before:absolute before:-top-2 before:left-4 before:h-3 before:w-12 before:rounded-t-lg before:bg-card before:border before:border-border` — applied via `relative` parent).
- Campaign name: `font-display text-lg font-semibold`.
- Stats row (`flex gap-4 text-xs text-muted-foreground mt-3`):
  - `<Package />` `5 Products`
  - `<Video />` `12 Reels`
- Footer: small `ChevronRight` aligned right, fades in on hover.
- onClick → `setOpenCampaignId(campaign.id)`.

---

## State 2 — Inside Campaign View

**Breadcrumb header** using shadcn `Breadcrumb`:
```
Campaigns  /  Summer Sale 2026
```
- "Campaigns" link → `setOpenCampaignId(null)`.
- Current page = campaign name.

**Title row**: campaign name as `h1` + small description, right-aligned `Button` `+ Add Product` (gradient-primary, opens Sheet).

**Toolbar** (`flex gap-3`):
- `Input` with `Search` icon — placeholder "Search products in this campaign…", bound to `search` state.
- `Select` (shadcn) — Status filter: `All`, `Active`, `Draft`.

**Data Table** (shadcn `Table`) inside `rounded-2xl border border-border bg-card overflow-hidden`:

| Column          | Cell content                                                                 |
|-----------------|------------------------------------------------------------------------------|
| Thumbnail       | `h-10 w-10 rounded-lg bg-muted ring-1 ring-border` with emoji/image          |
| Product Name    | `font-medium text-foreground`                                                |
| Key Selling Points | `text-sm text-muted-foreground truncate max-w-[280px]` (CSS ellipsis)     |
| Affiliate Link  | If present: `Button variant="ghost" size="icon"` with `Link2` icon + tooltip "Copy link"; copies to clipboard via `navigator.clipboard` + `toast`. If empty: dim "—". |
| Status          | `Badge` — Active: `bg-success/15 text-success border-success/30`; Draft: `bg-warning/15 text-warning border-warning/30` |
| Actions         | `DropdownMenu` triggered by `MoreVertical` ghost icon — items: `Edit`, `Delete` (destructive). Stub handlers + `toast`. |

Filter rows by `search` (matches name/keyPoints, case-insensitive) and `statusFilter`.

Empty state: if no rows after filter → centered muted text "No products match your filters." inside the table card.

---

## Add Product Drawer (shadcn `Sheet`, side="right")

Trigger: `+ Add Product` button. Controlled via `isAddProductOpen`.

`SheetContent` overrides: `sm:max-w-md w-full flex flex-col p-0` (so footer sticks to bottom).

**Structure**:
```
SheetHeader (px-6 pt-6 pb-4 border-b)
  SheetTitle: "Add New Product"
  SheetDescription: "Add a product to <campaign name>."

<div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
  - Product Image: dashed dropzone
      div: border-2 border-dashed border-border rounded-xl p-8 text-center
            hover:border-primary/40 hover:bg-muted/30 cursor-pointer transition
        UploadCloud icon (h-8 w-8 text-muted-foreground)
        "Drag & drop or click to upload"
        "PNG, JPG up to 5MB"
        hidden <input type="file" accept="image/*" />
  - Label + Input: Product Name
  - Label + Textarea: Key Selling Points
        rows={4}, placeholder "Enter key features for AI script generation"
  - Label + Input: Affiliate Link (type=url, placeholder "https://...")
  - Label + Select: Call to Action
        Options: "Shop Now", "Link in Bio", "Learn More"
</div>

SheetFooter (px-6 py-4 border-t flex gap-3 justify-end)
  Button variant="ghost" → close
  Button (gradient-primary) → toast success + close + reset form
```

Form state local to drawer (uncontrolled-ish with `useState` per field). On Save: append to current campaign's `products` array (local state), `toast({ title: "Product added" })`, close drawer.

---

## Components to Add/Use
- Existing: `Button`, `Input`, `Badge`, `Table*`, `Sheet*`, `Breadcrumb*`, `DropdownMenu*`, `Select*`, `Textarea`, `Label`, `useToast`.
- All present in the project (verified in `src/components/ui/`).
- Lucide icons: `FolderOpen`, `Plus`, `Package`, `Video`, `ChevronRight`, `Search`, `MoreVertical`, `Link2`, `UploadCloud`, `Edit`, `Trash2`.

---

## Files to Edit / Create
- **Edit** `src/pages/ContentLibrary.tsx` — full rewrite to the 2-state hierarchy described above. Keeps the same default export and route binding (`/library`).
- No route changes, no sidebar changes, no new dependencies.

## Notes
- All cards use `rounded-2xl`, generous padding (`p-5`/`p-6`), hover transitions (`transition-all duration-300`), and `framer-motion` entrance animations (`initial opacity 0 y 20`, staggered).
- Breadcrumb back-navigation is purely state-driven (no URL change) to keep this self-contained — simpler and matches the spec.
- Status badges use existing `success`/`warning` semantic tokens already in the design system.

