"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, ErrorNote, Loading, PageHeader, Panel, inputCls, selectCls } from "@/components/admin/ui";
import { Button, ButtonLink } from "@/components/ui/Button";
import { del, post, put, useAction, useAdmin, useAdminFetch } from "@/lib/admin";
import { formatDateTime, formatMoney, unitLabel, type Category, type Product } from "@/lib/api";
import { TIME_SLOTS, zonedToUtcISO } from "@/lib/time";

interface Maint { id: number; product_id: number; quantity: number; start_at: string; end_at: string; reason: string; is_damage: boolean }

export default function Inventory() {
  const products = useAdminFetch<Product[]>("/api/admin/products");
  const cats = useAdminFetch<Category[]>("/api/admin/categories");
  const maint = useAdminFetch<Maint[]>("/api/admin/maintenance");
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Catalogue & stock" title="Inventory" actions={<ButtonLink href="/admin/inventory/new" className="min-h-11">Add product</ButtonLink>} />
      {products.error && !products.data ? <ErrorNote retry={products.reload} /> : !products.data ? <Loading /> : products.data.length === 0 ? <Empty>No products yet.</Empty> : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Product</th><th>Category</th><th className="num">Price</th><th className="num">Deposit</th><th className="num">Stock</th><th>Visibility</th></tr></thead>
            <tbody>{products.data.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/admin/inventory/${p.id}`} className="link-draw font-semibold">{p.name}</Link></td>
                <td>{p.category?.name ?? "—"}</td>
                <td className="num">{formatMoney(p.unit_price)}/{unitLabel[p.pricing_unit]}</td>
                <td className="num">{formatMoney(p.security_deposit)}</td>
                <td className="num">{p.total_quantity}</td>
                <td>{p.is_active ? "Visible" : <span className="text-danger">Hidden</span>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      <MaintenanceSection products={products.data ?? []} maint={maint.data ?? []} reload={maint.reload} />
      <Categories cats={cats.data ?? []} reload={cats.reload} />
    </div>
  );
}

function MaintenanceSection({ products, maint, reload }: { products: Product[]; maint: Maint[]; reload: () => void }) {
  const { settings } = useAdmin();
  const tz = settings.timezone;
  const [v, setV] = useState({ product: "", qty: "1", sd: "", st: "09:00", ed: "", et: "18:00", reason: "", damage: false });
  const [warn, setWarn] = useState<string[]>([]);
  const { busy, error, run } = useAction();
  const names = new Map(products.map((p) => [p.id, p.name]));
  const save = () => run(async () => {
    const r = await post<{ conflicting_bookings: string[] }>("/api/admin/maintenance", {
      product_id: Number(v.product), quantity: Number(v.qty), start_at: zonedToUtcISO(v.sd, v.st, tz), end_at: zonedToUtcISO(v.ed, v.et, tz),
      reason: v.reason, is_damage: v.damage });
    setWarn(r.conflicting_bookings); setV({ ...v, reason: "", damage: false }); reload();
  });
  return (
    <Panel title="Maintenance & damaged equipment" id="m">
      <div className="grid gap-4 md:grid-cols-6">
        <div className="md:col-span-2"><label htmlFor="mp" className="eyebrow block">Product</label>
          <select id="mp" value={v.product} onChange={(e) => setV({ ...v, product: e.target.value })} className={selectCls}><option value="">Select…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label htmlFor="mq" className="eyebrow block">Units</label><input id="mq" type="number" min={1} value={v.qty} onChange={(e) => setV({ ...v, qty: e.target.value })} className={inputCls} /></div>
        <div><label htmlFor="msd" className="eyebrow block">From</label><input id="msd" type="date" value={v.sd} onChange={(e) => setV({ ...v, sd: e.target.value, ed: v.ed || e.target.value })} className={inputCls} /></div>
        <div><label htmlFor="med" className="eyebrow block">Until</label><input id="med" type="date" min={v.sd} value={v.ed} onChange={(e) => setV({ ...v, ed: e.target.value })} className={inputCls} /></div>
        <div><label htmlFor="mst" className="eyebrow block">Start time</label><select id="mst" value={v.st} onChange={(e) => setV({ ...v, st: e.target.value })} className={selectCls}>{TIME_SLOTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
        <div><label htmlFor="met" className="eyebrow block">End time</label><select id="met" value={v.et} onChange={(e) => setV({ ...v, et: e.target.value })} className={selectCls}>{TIME_SLOTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
        <div className="md:col-span-3"><label htmlFor="mr" className="eyebrow block">Reason</label><input id="mr" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} className={inputCls} /></div>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={v.damage} onChange={(e) => setV({ ...v, damage: e.target.checked })} className="accent-olive-deep" /> Damaged</label>
        <div className="flex items-end"><Button className="min-h-10" disabled={busy || !v.product || !v.sd || !v.ed} onClick={save}>Block stock</Button></div>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      {warn.length > 0 && <p role="alert" className="mt-3 border-l-2 border-danger pl-3 text-sm">Heads up: existing bookings overlap this period — {warn.join(", ")}. They are not cancelled automatically.</p>}
      {maint.length > 0 && (
        <ul className="mt-6 divide-y divide-line border-y border-line text-sm">
          {maint.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <span><strong>{names.get(m.product_id) ?? `#${m.product_id}`}</strong> × {m.quantity} {m.is_damage && <span className="text-danger">(damaged)</span>}
                <span className="block text-xs text-ink-soft">{formatDateTime(m.start_at, tz)} → {formatDateTime(m.end_at, tz)}{m.reason && ` · ${m.reason}`}</span></span>
              <button className="link-draw text-xs" onClick={() => run(async () => { await del(`/api/admin/maintenance/${m.id}`); reload(); })}>Release stock</button>
            </li>))}
        </ul>
      )}
    </Panel>
  );
}

function Categories({ cats, reload }: { cats: Category[]; reload: () => void }) {
  const [name, setName] = useState("");
  const { busy, error, run } = useAction();
  return (
    <Panel title="Categories" id="c">
      <ul className="divide-y divide-line border-y border-line">
        {cats.map((c) => <CatRow key={c.id} c={c} reload={reload} />)}
      </ul>
      <form className="mt-4 flex max-w-md items-end gap-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await post("/api/admin/categories", { name, sort_order: cats.length }); setName(""); reload(); }); }}>
        <div className="flex-1"><label htmlFor="cn" className="eyebrow block">New category</label><input id="cn" value={name} minLength={2} onChange={(e) => setName(e.target.value)} className={inputCls} /></div>
        <Button type="submit" variant="outline" className="min-h-10" disabled={busy || name.trim().length < 2}>Add</Button>
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </Panel>
  );
}
function CatRow({ c, reload }: { c: Category; reload: () => void }) {
  const [n, setN] = useState(c.name);
  const { busy, error, run } = useAction();
  return (
    <li className="flex flex-wrap items-center gap-4 py-2">
      <label className="sr-only" htmlFor={`cat${c.id}`}>Category name</label>
      <input id={`cat${c.id}`} value={n} onChange={(e) => setN(e.target.value)} className={`${inputCls} max-w-xs`} />
      <button className="link-draw text-xs disabled:opacity-40" disabled={busy || n === c.name || n.trim().length < 2}
        onClick={() => run(async () => { await put(`/api/admin/categories/${c.id}`, { name: n, sort_order: c.sort_order }); reload(); })}>Rename</button>
      <button className="link-draw text-xs text-danger" disabled={busy}
        onClick={() => run(async () => { await del(`/api/admin/categories/${c.id}`); reload(); })}>Delete (products become uncategorised)</button>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </li>
  );
}
