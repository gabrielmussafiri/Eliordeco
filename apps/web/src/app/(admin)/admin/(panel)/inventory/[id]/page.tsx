"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ErrorNote, Loading, PageHeader, Panel, inputCls, selectCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { Photo } from "@/components/ui/Photo";
import { del, post, put, useAction, useAdminFetch } from "@/lib/admin";
import { api, type Category, type PricingUnit, type Product } from "@/lib/api";

interface Form {
  name: string; category_id: string; description: string; specs: string; rental_conditions: string;
  unit_price: string; pricing_unit: PricingUnit; security_deposit: string; total_quantity: string;
  buf_before: string; buf_after: string; is_active: boolean;
}
const blank: Form = { name: "", category_id: "", description: "", specs: "", rental_conditions: "", unit_price: "", pricing_unit: "day",
  security_deposit: "0", total_quantity: "1", buf_before: "", buf_after: "", is_active: true };
const toForm = (p: Product & { buffer_before_minutes?: number | null; buffer_after_minutes?: number | null }): Form => ({
  name: p.name, category_id: p.category ? String(p.category.id) : "", description: p.description,
  specs: Object.entries(p.specifications ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n"), rental_conditions: p.rental_conditions,
  unit_price: String(p.unit_price), pricing_unit: p.pricing_unit, security_deposit: String(p.security_deposit),
  total_quantity: String(p.total_quantity), buf_before: p.buffer_before_minutes?.toString() ?? "", buf_after: p.buffer_after_minutes?.toString() ?? "",
  is_active: p.is_active,
});

export default function ProductEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const list = useAdminFetch<Product[]>(isNew ? null : "/api/admin/products");
  const cats = useAdminFetch<Category[]>("/api/admin/categories");
  const product = list.data?.find((p) => String(p.id) === id);
  if (!isNew && list.error) return <ErrorNote retry={list.reload} />;
  if (!isNew && !list.data) return <Loading />;
  if (!isNew && !product) return <ErrorNote message="Product not found." />;
  return <Editor key={product?.id ?? "new"} product={product} cats={cats.data ?? []} reload={list.reload} />;
}

function Editor({ product, cats, reload }: { product?: Product; cats: Category[]; reload: () => void }) {
  const router = useRouter();
  const [f, setF] = useState<Form>(product ? toForm(product) : blank);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const file = useRef<HTMLInputElement>(null);
  const up = useAction();
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF({ ...f, [k]: v }); setSaved(false); };

  const save = () => run(async () => {
    const specifications = Object.fromEntries(f.specs.split("\n").map((l) => [l.slice(0, Math.max(l.indexOf(":"), 0)).trim(), l.slice(l.indexOf(":") + 1).trim()]).filter(([k, v]) => k && v));
    const body = {
      name: f.name.trim(), category_id: f.category_id ? Number(f.category_id) : null, description: f.description, specifications,
      rental_conditions: f.rental_conditions, unit_price: f.unit_price, pricing_unit: f.pricing_unit, security_deposit: f.security_deposit || "0",
      total_quantity: Number(f.total_quantity), buffer_before_minutes: f.buf_before === "" ? null : Number(f.buf_before),
      buffer_after_minutes: f.buf_after === "" ? null : Number(f.buf_after), is_active: f.is_active,
    };
    if (product) { await put(`/api/admin/products/${product.id}`, body); setSaved(true); reload(); }
    else { const p = await post<Product>("/api/admin/products", body); router.replace(`/admin/inventory/${p.id}`); }
  });

  const upload = (files: FileList | null) => up.run(async () => {
    for (const fl of Array.from(files ?? [])) {
      const fd = new FormData(); fd.set("file", fl);
      await api(`/api/admin/products/${product!.id}/images`, { method: "POST", body: fd });
    }
    if (file.current) file.current.value = "";
    reload();
  });

  const num = (k: keyof Form, label: string, extra: object = {}) => (
    <div><label htmlFor={k} className="eyebrow block">{label}</label>
      <input id={k} inputMode="decimal" value={f[k] as string} onChange={(e) => set(k, e.target.value.replace(/[^\d.]/g, "") as never)} className={inputCls} {...extra} /></div>
  );

  return (
    <div>
      <p className="mb-4 text-sm"><Link href="/admin/inventory" className="link-draw">← Inventory</Link></p>
      <PageHeader eyebrow={product ? "Edit product" : "New product"} title={product?.name ?? "Add a product"} />
      <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_24rem]">
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="grid max-w-3xl gap-7">
          <div><label htmlFor="name" className="eyebrow block">Name</label><input id="name" required minLength={2} value={f.name} onChange={(e) => set("name", e.target.value)} className={inputCls} /></div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div><label htmlFor="cat" className="eyebrow block">Category</label>
              <select id="cat" value={f.category_id} onChange={(e) => set("category_id", e.target.value)} className={selectCls}><option value="">None</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <label className="flex items-end gap-3 pb-2 text-sm"><input type="checkbox" checked={f.is_active} onChange={(e) => set("is_active", e.target.checked)} className="h-4 w-4 accent-olive-deep" />
              Visible and bookable on the website</label>
          </div>
          <div><label htmlFor="desc" className="eyebrow block">Description</label><textarea id="desc" rows={4} value={f.description} onChange={(e) => set("description", e.target.value)} className={`${inputCls} border border-taupe p-3`} /></div>
          <div className="grid gap-6 sm:grid-cols-4">
            {num("unit_price", "Price (USD)", { required: true })}
            <div><label htmlFor="unit" className="eyebrow block">Per</label>
              <select id="unit" value={f.pricing_unit} onChange={(e) => set("pricing_unit", e.target.value as PricingUnit)} className={selectCls}>
                {["hour", "day", "weekend", "week"].map((u) => <option key={u}>{u}</option>)}</select></div>
            {num("security_deposit", "Deposit (USD)")}
            {num("total_quantity", "Units in stock", { inputMode: "numeric", required: true })}
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {num("buf_before", "Prep buffer before (min)", { inputMode: "numeric", placeholder: "Use default" })}
            {num("buf_after", "Return buffer after (min)", { inputMode: "numeric", placeholder: "Use default" })}
          </div>
          <div><label htmlFor="spec" className="eyebrow block">Specifications <span className="normal-case tracking-normal text-ink-soft">(one “Label: value” per line)</span></label>
            <textarea id="spec" rows={4} value={f.specs} onChange={(e) => set("specs", e.target.value)} className={`${inputCls} border border-taupe p-3`} /></div>
          <div><label htmlFor="cond" className="eyebrow block">Rental conditions</label><textarea id="cond" rows={3} value={f.rental_conditions} onChange={(e) => set("rental_conditions", e.target.value)} className={`${inputCls} border border-taupe p-3`} /></div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex items-center gap-5"><Button type="submit" disabled={busy || !f.name || !f.unit_price}>{busy ? "Saving…" : product ? "Save changes" : "Create product"}</Button>
            {saved && <span role="status" className="text-sm text-success">Saved.</span>}</div>
          <p className="text-xs text-ink-soft">Changing the price never alters existing bookings: they keep the price they were made at.</p>
        </form>

        <aside>
          <Panel title="Photos" id="ph">
            {!product ? <p className="text-sm text-ink-soft">Create the product first, then add photos.</p> : (
              <>
                <ul className="grid grid-cols-2 gap-3">
                  {product.images.map((im) => (
                    <li key={im.id}>
                      <div className="frame relative aspect-square"><Photo src={im.url} alt={im.alt} sizes="180px" /></div>
                      <button className="link-draw mt-1 text-xs text-danger" onClick={() => up.run(async () => { await del(`/api/admin/products/${product.id}/images/${im.id}`); reload(); })}>Remove</button>
                    </li>))}
                </ul>
                {product.images.length === 0 && <p className="text-sm text-ink-soft">No photos yet.</p>}
                <label htmlFor="up" className="eyebrow mt-5 block">Add photos</label>
                <input id="up" ref={file} type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={up.busy}
                  onChange={(e) => upload(e.target.files)} className="mt-2 block w-full text-sm file:mr-3 file:border file:border-espresso file:bg-transparent file:px-3 file:py-1.5 file:text-xs file:font-semibold file:uppercase" />
                <p className="mt-2 text-xs text-ink-soft">JPEG, PNG or WebP, up to 8 MB each. The first photo is the cover.</p>
                {up.error && <p role="alert" className="mt-2 text-sm text-danger">{up.error}</p>}
              </>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
