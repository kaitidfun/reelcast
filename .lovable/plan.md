

## Goal
Enhance `src/pages/ContentLibrary.tsx` with:
1. **Search + filter + view toggle (Grid/List)** on both Campaigns view and Products view.
2. **Campaign cards** show a **mini grid of product thumbnails** inside (preview of contents).
3. **Products view** gets a **Grid mode** (cards) in addition to the existing List/Table mode, where each product card shows status, reel count, and a **"Create Reel"** button that navigates to the Reel Studio prefilled with that product.

---

## 1. Shared State Additions (top of `ContentLibrary.tsx`)
```ts
const [campaignSearch, setCampaignSearch] = useState("");
const [campaignView, setCampaignView] = useState<"grid" | "list">("grid");
const [productView, setProductView] = useState<"grid" | "list">("grid"); // default Grid per request
```
Existing `search` + `statusFilter` stay (used in Products view).

Add `reelsGenerated: number` to the `Product` type and seed each mock product with a value (0–8). Keep `Campaign.reelsCount` as the sum.

---

## 2. Campaigns View — State 1

**Toolbar row** (above the grid, below the header):
- `Input` with `Search` icon — placeholder "Search campaigns…", filters by `name` + `description` (case-insensitive).
- **View toggle** on the right: shadcn `ToggleGroup` (single, `type="single"`) with two items — `LayoutGrid` icon (grid) and `List` icon (list). Bound to `campaignView`.

**Empty state**: muted "No campaigns match your search."

**Campaign Card — Grid mode** (existing card, enhanced):
- Keep folder-tab styling, name, description, stats.
- **Add a mini product thumbnail grid** below the description:
  - `grid grid-cols-4 gap-1.5 mt-4`
  - Show first 4 products as `h-12 rounded-lg bg-muted ring-1 ring-border flex items-center justify-center text-xl` cells (emoji thumbnails).
  - If more than 4 products, the 4th cell shows `+N` overlay (e.g. `+3`) instead of an emoji.
  - If 0 products, render 4 empty dashed placeholder cells.
- Stats row stays below the mini-grid.

**Campaign Card — List mode**:
- Horizontal layout: `flex items-center gap-4 p-4 rounded-2xl border bg-card hover:border-primary/30`.
- Left: small `FolderOpen` gradient tile (`h-10 w-10`).
- Middle: name + description (truncate) + stats inline (`Package` count · `Video` count).
- Right: small horizontal strip of up to 4 thumbnails (`flex -space-x-2`) + `ChevronRight`.
- Click → open campaign (same handler).

---

## 3. Products View — State 2

**Toolbar** (extend existing):
- Existing search input + status `Select`.
- **Add view toggle** on the right: same `ToggleGroup` pattern, bound to `productView`. Default = `grid`.

**Grid mode** (new, default):
- `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5`.
- **Product Card** (`motion.div`):
  - `rounded-2xl border border-border bg-card overflow-hidden card-shine hover:border-primary/30 hover:shadow-elevated transition-all`.
  - **Top media area**: `aspect-video bg-muted flex items-center justify-center text-5xl relative`
    - Renders the emoji thumbnail at large size.
    - Top-right corner: `Badge` with status (Active = success, Draft = warning).
    - Top-left corner: small pill `bg-background/70 backdrop-blur text-xs` showing `<Video className="h-3 w-3" /> {reelsGenerated} reels`.
  - **Body** (`p-4 space-y-3`):
    - Product name (`font-semibold text-foreground line-clamp-1`).
    - Key selling points (`text-xs text-muted-foreground line-clamp-2`).
    - Footer row (`flex items-center justify-between gap-2 pt-2`):
      - Left: ghost icon button `Link2` (copy affiliate link, disabled if empty) + ghost icon `MoreVertical` dropdown with Edit/Delete.
      - Right: **`Create Reel`** button — `size="sm"`, gradient-primary, `Sparkles` icon, navigates to `/create` with state `{ productId, productName, campaignId }` via `useNavigate`.

**List mode**:
- Existing `Table` layout, plus:
  - Add a new column **"Reels"** (between Status and Actions): shows `<Video className="h-3.5 w-3.5" /> {reelsGenerated}` in muted text.
  - Add a new column **"Create"** (before Actions, width ~120px): renders a small gradient-primary button `Create Reel` with `Sparkles` icon → same nav handler as Grid mode.
- Adjust `colSpan` of empty state row to new total (8).

---

## 4. Create Reel Handler
```ts
const navigate = useNavigate();
const handleCreateReel = (product: Product) => {
  navigate("/create", { state: { productId: product.id, productName: product.name, campaignId: currentCampaign?.id } });
};
```
The Reel Studio (`/create`) doesn't need to consume this state today — passing it forward is forward-compatible and the route already exists.

---

## 5. New Imports
- Lucide: add `LayoutGrid`, `List`, `Sparkles`.
- shadcn: `ToggleGroup`, `ToggleGroupItem` from `@/components/ui/toggle-group` (already in project).
- React Router: `useNavigate` from `react-router-dom`.

---

## Files to Edit
- **Edit** `src/pages/ContentLibrary.tsx` — add search/filter/view-toggle to Campaigns view, add product thumbnail mini-grid to campaign cards, add Grid mode + reel count + Create Reel button in Products view (both Grid and List).

No new dependencies. No route changes. No backend changes.

