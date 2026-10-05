import { useEffect, useState } from "react";
import "./Billingdashboard.css";

/* ---------- helpers ---------- */
const iso = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("en-CA"); };
const fmtDay = (s) => new Date(s + "T00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
const stamp = () => new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
const CATS = ["Food", "Restaurant", "Room Service", "Laundry", "Minibar", "Extra Bed", "Extra Guest", "Transportation", "Spa", "Other"];
const MODES = ["Cash", "Card", "UPI", "Bank Transfer", "Online Payment"];
const LABEL = { paid: "Paid", partial: "Partially Paid", pending: "Payment Pending", overdue: "Overdue", disputed: "Disputed" };
const BASE = { overdue: "pending", disputed: "partial" };
const XTRA = { overdue: { background: "#fbe3e1", color: "#a12b24" }, disputed: { background: "#ece6f6", color: "#5b3f93" } };
const HOTEL = { name: "VEYRA", addr: "12 Palm Avenue, Thiruvananthapuram, Kerala 695001", contact: "+91 471 255 0100 · billing@regalcourt.com" };
const NTYPES = ["Billing", "Checkout", "Payment", "Failed", "Partial", "Overdue", "Refund", "Correction", "Verification"];
const ME0 = { name: "Meera Nair", id: "BL-3001", role: "Billing Staff", dept: "Accounts & Billing", email: "meera@regalcourt.com", phone: "+91 98470 33001", joined: "Aug 2020", pw: "bill1234" };
const MAX_DISC = 10; // % a billing clerk may give without administrator approval

const totals = (lines, svc, taxPct, disc, fee = 0) => {
  const subtotal = sum(lines, (l) => l.amt);
  const service = (subtotal * svc) / 100;
  const discount = Math.min(subtotal, disc.type === "%" ? (subtotal * disc.val) / 100 : disc.val);
  const tax = ((subtotal + service - discount + fee) * taxPct) / 100;
  return { subtotal, service, discount, fee, tax, total: Math.round(subtotal + service - discount + fee + tax) };
};
const paidOf = (b) => sum(b.payments.filter((p) => p.status === "Paid"), (p) => p.amt);
const balOf = (b) => b.total - paidOf(b);
const statusOf = (b) => (balOf(b) <= 0 ? "paid" : b.disputed ? "disputed" : b.due < iso() ? "overdue" : paidOf(b) > 0 ? "partial" : "pending");
const estOf = (g) => {
  const n = Math.max(1, g.outD - g.inD);
  return totals([{ amt: g.rate * n }, ...g.extras], 5, g.rate > 7500 ? 18 : 12, { type: "₹", val: 0 }).total;
};
const stageLabel = (g, b) => (g.stage === "done" ? "Checkout Completed" : g.stage === "billed" ? (balOf(b) <= 0 ? "Paid" : paidOf(b) > 0 ? "Partially Paid" : "Payment Pending") : g.outD === 0 ? "Checking Out Today" : "In House");

/* ---------- sample data (replace with API calls) ---------- */
const X = (id, cat, desc, amt, at, by) => ({ id, cat, desc, amt, at, by });
const GUESTS0 = [
  { id: "g1", guest: "Nikhil Varma", phone: "98470 11223", bk: "BK-2301", room: 106, type: "Single", rate: 2800, inD: -3, outD: 0, stage: "checkout", extras: [X(1, "Restaurant", "Dinner", 640, "Yesterday 20:10", "Restaurant"), X(2, "Laundry", "2 shirts", 180, "Yesterday 18:00", "Laundry")] },
  { id: "g2", guest: "Priya Raman", phone: "99610 45872", bk: "BK-2302", room: 202, type: "Double", rate: 4200, inD: -2, outD: 0, stage: "checkout", extras: [X(3, "Minibar", "Soft drinks, chocolates", 450, "Today 07:40", "Housekeeping")] },
  { id: "g3", guest: "Divya Menon", phone: "94470 88231", bk: "BK-2303", room: 205, type: "Double", rate: 4200, inD: -4, outD: 0, stage: "checkout", extras: [X(4, "Room Service", "Late dinner", 1280, "Yesterday 22:30", "Room Service")] },
  { id: "g4", guest: "Sanjana Pillai", phone: "98950 23417", bk: "BK-2304", room: 302, type: "Deluxe", rate: 6200, inD: -2, outD: 2, stage: "inhouse", extras: [] },
  { id: "g5", guest: "Arjun Das", phone: "97460 77120", bk: "BK-2305", room: 401, type: "Suite", rate: 11000, inD: -1, outD: 2, stage: "inhouse", extras: [X(5, "Food", "Breakfast for two", 900, "Today 08:15", "Restaurant")] },
];
const mkBill = (no, guest, phone, room, ago, nights, rate, extras, pays, tax = 12, dueOff) => {
  const lines = [{ cat: "Room", desc: `Room ${room} · ${nights} night${nights > 1 ? "s" : ""}`, qty: nights, rate, amt: rate * nights }, ...extras.map(([cat, desc, amt]) => ({ cat, desc, qty: 1, rate: amt, amt }))];
  const disc = { type: "₹", val: 0 }, t = totals(lines, 5, tax, disc);
  return { no, guest, phone, room, bk: `BK-${2200 + (no % 100)}`, date: iso(-ago), due: iso(dueOff ?? 3 - ago), lines, svc: 5, taxPct: tax, disc, by: "Meera Nair", ...t,
    payments: pays.map(([mode, amt, ref, status = "Paid"], i) => ({ id: `PAY-${5000 + (no % 100) * 10 + i}`, mode, amt: amt === "full" ? t.total : amt, ref, date: iso(-ago), time: "11:20", by: "Meera Nair", status })) };
};
const BILLS0 = [
  mkBill(1041, "Rohit Kurian", "98460 55012", 203, 0, 2, 4200, [["Restaurant", "Dinner", 900]], [["UPI", "full", "rohit@upi", "Processing"]]),
  mkBill(1040, "Lakshmi Iyer", "99470 31200", 301, 0, 3, 6200, [["Minibar", "Snacks", 520], ["Laundry", "Saree press", 300]], [["Card", "full", "•••• 4421"]]),
  mkBill(1039, "Faisal Ahmed", "97450 22001", 104, 0, 1, 2800, [], [["Cash", 1500, "-"]]),
  mkBill(1038, "Meera Thomas", "98950 77310", 402, 1, 2, 11000, [["Restaurant", "Banquet dinner", 3200]], [["Card", "full", "•••• 9034"]], 18),
  mkBill(1037, "George Mathew", "94960 12875", 201, 1, 2, 4200, [["Other", "Broken lamp", 1500]], [["Cash", 5000, "-"]]),
  mkBill(1036, "Anjali Nair", "98470 90311", 105, 2, 1, 2800, [], [], 12, -1),
  mkBill(1035, "Vishnu Das", "99950 64120", 303, 3, 2, 6200, [["Room Service", "Dinner", 1100]], [["UPI", "full", "vishnu@okbank"]]),
];
const REF0 = [{ id: "RF-301", no: 1038, guest: "Meera Thomas", amt: 3200, reason: "Banquet cancelled", mode: "Card", by: "Meera Nair", appr: "Suresh Pillai", date: iso(), status: "Approved" }];
const NOTE0 = [["Billing", "New guest awaiting billing: Room 106", "08:40"], ["Checkout", "Guest checking out soon: Room 202", "08:55"], ["Billing", "New bill request from front desk: Room 205", "09:05"],
  ["Verification", "Payment verification required: PAY-5410", "09:12"], ["Overdue", "Invoice INV-1036 is overdue", "09:20"], ["Correction", "Invoice correction request: INV-1037", "09:30"]].map(([type, text, time], id) => ({ id, type, text, time, read: false }));

const NAV = [
  ["overview", "Overview", "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"], ["pending", "Pending Bills", "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2"],
  ["create", "New Bill", "M12 5v14M5 12h14"], ["history", "Billing History", "M4 5h16M4 12h16M4 19h10"], ["payments", "Payments", "M3 7h18v11H3zM3 11h18"],
  ["refunds", "Refunds", "M9 14l-4-4 4-4M5 10h10a4 4 0 010 8h-3"], ["revenue", "Daily Revenue", "M5 20V10M12 20V4M19 20v-7"],
  ["accounts", "Guest Accounts", "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0"], ["reports", "Reports", "M6 3h9l4 4v14H6zM9 12h7M9 16h7"],
];
const BELL = "M6 9a6 6 0 0112 0c0 6 3 7 3 7H3s3-1 3-7M10 20a2 2 0 004 0";
const S = {
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(310px,1fr))", gap: 14 },
  card: { background: "#fff", border: "1px solid #e6e1d6", borderRadius: 14, padding: 16, display: "grid", gap: 8 },
  dd: { position: "absolute", right: 0, top: "115%", background: "#fff", color: "#1a2347", border: "1px solid #e6e1d6", borderRadius: 12, padding: 6, display: "grid", minWidth: 200, zIndex: 40, boxShadow: "0 10px 28px -12px rgba(0,0,0,.35)" },
  ddi: { background: "none", border: 0, textAlign: "left", padding: "10px 12px", borderRadius: 8, cursor: "pointer", font: "inherit", color: "inherit" },
  box: { background: "#fff", borderRadius: 16, padding: 24, width: "min(420px,92vw)", display: "grid", gap: 14 },
  acts: { display: "flex", flexWrap: "wrap", gap: 6 }, toast: { position: "fixed", right: 20, bottom: 20, display: "grid", gap: 8, zIndex: 99 },
  two: { display: "flex", gap: 8 }, sel: { cursor: "pointer" },
};

const Icon = ({ d }) => <svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Stat = ({ label, value, sub, tone, onClick }) => (
  <div className={`stat ${tone || ""}`} role="button" tabIndex={0} style={S.sel} onClick={onClick} onKeyDown={(e) => e.key === "Enter" && onClick && onClick()}><span>{label}</span><b>{value}</b><small>{sub}</small></div>
);
const St = ({ s }) => <span className={`tag s-${BASE[s] || s}`} style={XTRA[s]}>{LABEL[s]}</span>;
const Pill = ({ t, tone = "pending" }) => <span className={`tag s-${tone}`}>{t}</span>;
const ICONS = {
  collect: "M3 7h18v11H3zM3 11h18", view: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z",
  print: "M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z", send: "M22 2L11 13M22 2l-7 20-4-9-9-4z", del: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  verify: "M12 3a9 9 0 100 18 9 9 0 000-18zM8 12l3 3 5-6", refund: "M9 14l-4-4 4-4M5 10h10a4 4 0 010 8h-3",
};
const IconBtn = ({ k, label, onClick, tone = "" }) => <button type="button" className={`ib ${tone}`} title={label} aria-label={label} onClick={onClick}><Icon d={ICONS[k]} /></button>;
const Pager = ({ n, page, set, size }) => n > size ? (
  <div style={{ ...S.two, justifyContent: "flex-end", alignItems: "center" }}><button className="btn-line" disabled={page === 0} onClick={() => set(page - 1)}>Previous</button>
    <small>Page {page + 1} of {Math.ceil(n / size)}</small><button className="btn-line" disabled={(page + 1) * size >= n} onClick={() => set(page + 1)}>Next</button></div>) : null;

function BillTable({ rows, onOpen, extra, empty = "No bills match.", staff, icons }) {
  if (!rows.length) return <p className="empty">{empty}</p>;
  return (
    <div className="scroll"><table>
      <thead><tr><th>Invoice</th><th>Guest</th><th>Room</th><th>Booking</th><th>Date</th><th>Due</th><th className="r">Total</th><th className="r">Paid</th><th className="r">Balance</th><th>Status</th>{staff && <th>Staff</th>}<th /></tr></thead>
      <tbody>{rows.map((b) => (
        <tr key={b.no}><td className="mono">INV-{b.no}</td><td><b>{b.guest}</b></td><td className="mono">{b.room}</td><td className="mono">{b.bk}</td><td>{fmtDay(b.date)}</td><td>{fmtDay(b.due)}</td>
          <td className="r">{inr(b.total)}</td><td className="r">{inr(paidOf(b))}</td><td className="r">{inr(balOf(b))}</td><td><St s={statusOf(b)} /></td>{staff && <td>{b.by}</td>}
          <td className="r"><span style={S.acts}>{icons ? <IconBtn k={balOf(b) > 0 ? "collect" : "view"} tone={balOf(b) > 0 ? "gold" : ""} label={balOf(b) > 0 ? "Collect payment" : "View invoice"} onClick={() => onOpen(b.no)} /> : <button className="btn-line" onClick={() => onOpen(b.no)}>{balOf(b) > 0 ? "Collect" : "View"}</button>}{extra && extra(b)}</span></td></tr>))}</tbody>
    </table></div>
  );
}

/* ---------- login ---------- */
function Login({ onLogin }) {
  const [f, setF] = useState({ id: "meera@regalcourt.com", pw: "" }), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const submit = (e) => { e.preventDefault(); setBusy(true); setErr(""); setTimeout(() => { setBusy(false); ["meera@regalcourt.com", "bl-3001"].includes(f.id.trim().toLowerCase()) && f.pw === ME0.pw ? onLogin() : setErr("Incorrect ID or password."); }, 500); };
  return (
    <div className="bd" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <form className="panel" onSubmit={submit} style={{ width: "min(400px,92vw)", display: "grid", gap: 12 }}>
        <p className="kicker">{HOTEL.name}</p><h3>Billing desk sign in</h3>
        <label className="fld">Email / Employee ID<input value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} /></label>
        <label className="fld">Password<input type="password" value={f.pw} onChange={(e) => setF({ ...f, pw: e.target.value })} /></label>
        {err && <p style={{ color: "#a12b24", margin: 0 }} role="alert">{err}</p>}
        <button className="btn-navy" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <small className="muted">Demo password: bill1234</small>
      </form>
    </div>
  );
}

/* ---------- bill editor ---------- */
function Editor({ guests, startId, admin, onGenerate }) {
  const blank = { gid: "", nights: 1, added: [], svc: 5, tax: 12, discType: "%", discVal: 0, fee: 0, review: false };
  const [s, setS] = useState(blank), [gq, setGq] = useState(""), [f, setF] = useState({ cat: "Food", desc: "", amt: "" });
  const g = guests.find((x) => x.id === s.gid);
  const pick = (id) => { const x = guests.find((y) => y.id === id); setS(x ? { ...blank, gid: id, nights: Math.max(1, x.outD - x.inD), tax: x.rate > 7500 ? 18 : 12 } : blank); };
  useEffect(() => { if (startId) pick(startId); }, [startId]); // eslint-disable-line
  const opts = guests.filter((x) => `${x.guest} ${x.phone} ${x.bk} ${x.room}`.toLowerCase().includes(gq.toLowerCase()));
  const lines = g ? [{ cat: "Room", desc: `Room ${g.room} · ${s.nights} night${s.nights > 1 ? "s" : ""}`, qty: s.nights, rate: g.rate, amt: g.rate * s.nights },
    ...g.extras.map((e) => ({ cat: e.cat, desc: e.desc, qty: 1, rate: e.amt, amt: e.amt, posted: true })), ...s.added] : [];
  const t = totals(lines, s.svc, s.tax, { type: s.discType, val: s.discVal }, s.fee);
  const pct = s.discType === "%" ? s.discVal : t.subtotal ? (s.discVal / t.subtotal) * 100 : 0;
  const needsApproval = !admin && pct > MAX_DISC;
  const add = () => { const amt = Number(f.amt); if (!(amt > 0)) return; setS({ ...s, added: [...s.added, { id: Date.now(), cat: f.cat, desc: f.desc || f.cat, qty: 1, rate: amt, amt }] }); setF({ ...f, desc: "", amt: "" }); };
  const generate = () => onGenerate(g, { lines: lines.map(({ cat, desc, qty, rate, amt }) => ({ cat, desc, qty, rate, amt })), svc: s.svc, taxPct: s.tax, disc: { type: s.discType, val: s.discVal }, ...t });
  return (
    <div className="editor">
      <section className="panel">
        <p className="kicker">Step 1 · Guest</p><h3>Find guest and add charges</h3>
        <label className="fld">Search guest, phone, booking ID or room<input value={gq} placeholder="e.g. Priya, 99610, BK-2302, 202" onChange={(e) => setGq(e.target.value)} /></label>
        <label className="fld">Guest<select value={s.gid} onChange={(e) => pick(e.target.value)}><option value="">Select a guest…</option>{opts.map((x) => <option key={x.id} value={x.id}>Room {x.room} · {x.guest} · {x.bk}</option>)}</select></label>
        {!g && <p className="empty">Pick a guest. Charges posted by restaurant, laundry or minibar are added automatically.</p>}
        {g && (<>
          <p className="muted">{g.guest} · {g.phone} · {g.type} · Check-in {fmtDay(iso(g.inD))} · Check-out {fmtDay(iso(g.outD))}</p>
          <div className="row2">
            <label className="fld">Nights<input type="number" min="1" value={s.nights} onChange={(e) => setS({ ...s, nights: Math.max(1, Number(e.target.value) || 1) })} /></label>
            <div className="fld">Room rate<div className="static">{inr(g.rate)} / night</div></div>
          </div>
          <h4>Add extra charge</h4>
          <div className="add">
            <select value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
            <input placeholder="Description" value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} />
            <input type="number" min="0" placeholder="Amount ₹" value={f.amt} onChange={(e) => setF({ ...f, amt: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
            <button className="btn-gold" onClick={add}>Add</button>
          </div>
          <div className="row3">
            <label className="fld">Service charge %<input type="number" min="0" value={s.svc} onChange={(e) => setS({ ...s, svc: Number(e.target.value) || 0 })} /></label>
            <label className="fld">GST %<select value={s.tax} onChange={(e) => setS({ ...s, tax: Number(e.target.value) })}>{[0, 5, 12, 18].map((x) => <option key={x} value={x}>{x}%</option>)}</select></label>
            <label className="fld">Additional fee ₹<input type="number" min="0" value={s.fee} onChange={(e) => setS({ ...s, fee: Number(e.target.value) || 0 })} /></label>
          </div>
          <label className="fld">Discount<span className="join"><input type="number" min="0" value={s.discVal} onChange={(e) => setS({ ...s, discVal: Number(e.target.value) || 0 })} />
            <select value={s.discType} onChange={(e) => setS({ ...s, discType: e.target.value })}><option>%</option><option>₹</option></select></span></label>
          {needsApproval && <p style={{ color: "#a12b24", margin: 0 }}>Discounts above {MAX_DISC}% need administrator approval.</p>}
        </>)}
      </section>
      <section className="panel sum">
        <p className="kicker">Step 2 · Review</p><h3>{g ? `${g.guest} · Room ${g.room}` : "No guest selected"}</h3>
        {g && (<>
          <ul className="lines">{lines.map((l, i) => (
            <li key={i}><span><em className="cat">{l.cat}</em>{l.desc}{l.posted && <small className="block">Posted by department</small>}</span>
              <span>{inr(l.amt)}{l.id && <button className="x" aria-label="Remove charge" onClick={() => setS({ ...s, added: s.added.filter((a) => a.id !== l.id) })}>×</button>}</span></li>))}</ul>
          <dl className="calc">
            <dt>Subtotal</dt><dd>{inr(t.subtotal)}</dd><dt>Service charge ({s.svc}%)</dt><dd>{inr(t.service)}</dd>
            {t.discount > 0 && <><dt>Discount</dt><dd className="neg">− {inr(t.discount)}</dd></>}{s.fee > 0 && <><dt>Additional fee</dt><dd>{inr(s.fee)}</dd></>}
            <dt>GST ({s.tax}%)</dt><dd>{inr(t.tax)}</dd><dt className="grand">Total payable</dt><dd className="grand">{inr(t.total)}</dd>
            <dt>Amount paid</dt><dd>{inr(0)}</dd><dt>Outstanding</dt><dd>{inr(t.total)}</dd>
          </dl>
          {!s.review ? <button className="btn-navy" disabled={needsApproval} onClick={() => setS({ ...s, review: true })}>Review bill</button> : (
            <div style={{ display: "grid", gap: 8 }}><p className="muted">Check the charges above. Generating creates the invoice and updates the guest account.</p>
              <div style={S.two}><button className="btn-line" onClick={() => setS({ ...s, review: false })}>Back to edit</button><button className="btn-navy" onClick={generate}>Confirm and generate invoice</button></div></div>)}
        </>)}
      </section>
    </div>
  );
}

/* ---------- invoice, receipt and payment modal ---------- */
function BillModal({ bill, admin, onClose, onPay, onVerify, onFail, onSend, onEdit, onCancel, onDispute, toast }) {
  const [mode, setMode] = useState("Cash"), [amt, setAmt] = useState(""), [ref, setRef] = useState(""), [rc, setRc] = useState(null), [edit, setEdit] = useState(false);
  const [ed, setEd] = useState({ disc: bill.discount, fee: bill.fee || 0 });
  const bal = balOf(bill), st = statusOf(bill), due = Math.min(Number(amt) || bal, bal);
  const rcp = bill.payments.find((p) => p.id === rc);
  const download = () => {
    const txt = [`${HOTEL.name}`, HOTEL.addr, `INVOICE INV-${bill.no} · ${bill.date}`, `Guest: ${bill.guest} · Room ${bill.room} · ${bill.bk}`, "", ...bill.lines.map((l) => `${l.cat} | ${l.desc} | ${l.qty} x ${l.rate} | ${l.amt}`), "",
      `Subtotal ${bill.subtotal}`, `Discount ${bill.discount}`, `Service ${bill.service}`, `Tax ${bill.tax}`, `Total ${bill.total}`, `Paid ${paidOf(bill)}`, `Balance ${bal}`].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain" })); a.download = `INV-${bill.no}.txt`; a.click(); toast("Invoice downloaded");
  };
  const Head = ({ sub }) => (
    <header className="sheet-h"><div><h2>{HOTEL.name}</h2><small>{HOTEL.addr}</small><br /><small>{HOTEL.contact}</small></div>
      <div className="r"><b className="mono">{sub}</b><small>{fmtDay(bill.date)} {bill.date.slice(0, 4)}</small>{!rcp && <St s={st} />}</div></header>
  );
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Invoice ${bill.no}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-bar no-print"><b>{rcp ? `Receipt · ${rcp.id}` : `Invoice INV-${bill.no}`}</b>
          <span style={S.acts}>{rcp && <button className="btn-line" onClick={() => setRc(null)}>Back to invoice</button>}<button className="btn-line" onClick={() => window.print()}>Print</button>
            {!rcp && <><button className="btn-line" onClick={download}>Download</button><button className="btn-line" onClick={() => onSend(bill)}>Send</button></>}<button className="btn-line" onClick={onClose}>Close</button></span></div>
        {rcp ? (
          <article className="sheet"><Head sub={`RCP-${rcp.id.slice(4)}`} />
            <p className="billed">Received from <b>{bill.guest}</b> · Room <b className="mono">{bill.room}</b> · Invoice INV-{bill.no}</p>
            <dl className="calc"><dt>Amount received</dt><dd>{inr(rcp.amt)}</dd><dt>Payment method</dt><dd>{rcp.mode}</dd><dt>Transaction ID</dt><dd>{rcp.ref}</dd><dt>Date</dt><dd>{fmtDay(rcp.date)} {rcp.time}</dd>
              <dt>Received by</dt><dd>{rcp.by}</dd><dt>Status</dt><dd>{rcp.status}</dd><dt><b>Balance remaining</b></dt><dd><b>{inr(bal)}</b></dd></dl>
            <p className="thanks">Thank you. This receipt confirms your payment.</p></article>
        ) : (
          <article className="sheet"><Head sub={`INV-${bill.no}`} />
            <p className="billed">Billed to <b>{bill.guest}</b>{bill.phone && ` · ${bill.phone}`} · Room <b className="mono">{bill.room}</b> · Booking <b className="mono">{bill.bk}</b></p>
            <table><thead><tr><th>Description</th><th className="r">Qty</th><th className="r">Rate</th><th className="r">Tax</th><th className="r">Discount</th><th className="r">Amount</th></tr></thead>
              <tbody>{bill.lines.map((l, i) => <tr key={i}><td>{l.cat} · {l.desc}</td><td className="r">{l.qty}</td><td className="r">{inr(l.rate)}</td><td className="r">{bill.taxPct}%</td><td className="r">{bill.subtotal ? inr((bill.discount * l.amt) / bill.subtotal) : "-"}</td><td className="r">{inr(l.amt)}</td></tr>)}</tbody></table>
            <dl className="calc"><dt>Subtotal</dt><dd>{inr(bill.subtotal)}</dd>{bill.discount > 0 && <><dt>Discount</dt><dd className="neg">− {inr(bill.discount)}</dd></>}<dt>Tax ({bill.taxPct}%)</dt><dd>{inr(bill.tax)}</dd>
              <dt>Service charge ({bill.svc}%)</dt><dd>{inr(bill.service)}</dd>{bill.fee > 0 && <><dt>Additional fee</dt><dd>{inr(bill.fee)}</dd></>}<dt className="grand">Grand total</dt><dd className="grand">{inr(bill.total)}</dd>
              <dt>Amount paid</dt><dd>{inr(paidOf(bill))}</dd><dt><b>Balance due</b></dt><dd><b>{inr(bal)}</b></dd></dl>
            {bill.payments.length > 0 && <ul className="paylist">{bill.payments.map((p) => (
              <li key={p.id}><span>{p.id} · {fmtDay(p.date)} · {p.mode} · {p.ref} · {p.status}</span>
                <span style={S.acts}><b>{inr(p.amt)}</b>{p.status === "Processing" && <><button className="btn-line no-print" onClick={() => onVerify(bill.no, p.id)}>Verify</button><button className="btn-line no-print" onClick={() => onFail(bill.no, p.id)}>Failed</button></>}
                  {p.status === "Paid" && <button className="btn-line no-print" onClick={() => setRc(p.id)}>Receipt</button>}</span></li>))}</ul>}
            <p className="thanks">Thank you for staying with us. Terms: payment due by {fmtDay(bill.due)}. Disputes must be raised within 7 days. {HOTEL.contact}</p></article>)}
        {!rcp && (<div className="payform no-print">
          {bal > 0 && (<><h4>Record payment · due {inr(bal)}</h4>
            <div className="modes" role="radiogroup">{MODES.map((m) => <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "is-on" : ""} onClick={() => setMode(m)}>{m}</button>)}</div>
            <div className="row2"><input type="number" min="1" max={bal} placeholder="Amount (blank = full balance)" value={amt} onChange={(e) => setAmt(e.target.value)} /><input placeholder={mode === "Cash" ? "Note (optional)" : "Transaction ID / reference"} value={ref} onChange={(e) => setRef(e.target.value)} /></div>
            <button className="btn-navy" onClick={() => { onPay(bill.no, { mode, amt: due, ref }); setAmt(""); setRef(""); }}>Record {inr(due)} · {due < bal ? "partial" : "full"} payment</button></>)}
          {paidOf(bill) === 0 && !edit && <div style={S.acts}><button className="btn-line" onClick={() => setEdit(true)}>Edit bill</button></div>}
          {bal > 0 && <div style={S.acts}><button className="btn-line" onClick={() => onDispute(bill.no)}>{bill.disputed ? "Clear dispute" : "Mark disputed"}</button></div>}
          {edit && (<div style={{ display: "grid", gap: 8 }}><div className="row2"><label className="fld">Discount ₹<input type="number" min="0" value={ed.disc} onChange={(e) => setEd({ ...ed, disc: Number(e.target.value) || 0 })} /></label>
            <label className="fld">Additional fee ₹<input type="number" min="0" value={ed.fee} onChange={(e) => setEd({ ...ed, fee: Number(e.target.value) || 0 })} /></label></div>
            <div style={S.acts}><button className="btn-navy" onClick={() => { onEdit(bill.no, ed); setEdit(false); }}>Save changes</button><button className="btn-line" onClick={() => onCancel(bill.no)}>Cancel invoice</button><button className="btn-line" onClick={() => setEdit(false)}>Close editor</button></div></div>)}
        </div>)}
      </div>
    </div>
  );
}

/* ---------- main ---------- */
function Billing({ onLogout }) {
  const [view, setView] = useState("overview"), [guests, setGuests] = useState(GUESTS0), [bills, setBills] = useState(BILLS0), [refunds, setRefunds] = useState(REF0);
  const [hk, setHk] = useState([]), [notes, setNotes] = useState(NOTE0), [audits, setAudits] = useState([]);
  const [acts, setActs] = useState([["Invoice INV-1041 created", "Rohit Kurian · Room 203", "Meera Nair", "09:02", "Done"], ["Payment received from Room 205", "Divya Menon", "Meera Nair", "09:25", "Done"], ["New checkout billing request received", "Room 106", "Front desk", "08:40", "New"]]);
  const [startId, setStartId] = useState(""), [openNo, setOpenNo] = useState(null), [clock, setClock] = useState(new Date()), [q, setQ] = useState("");
  const [flt, setFlt] = useState({ status: "all", from: "", to: "", room: "", sort: "new" }), [hp, setHp] = useState(0), [day, setDay] = useState(iso()), [rv, setRv] = useState({ mode: "all", cat: "all", range: 7 });
  const [pf, setPf] = useState({ when: "all", room: "", guest: "", status: "all", sort: "checkout" }), [py, setPy] = useState({ status: "all", mode: "all" });
  const [loading, setLoading] = useState(true), [toasts, setToasts] = useState([]), [menu, setMenu] = useState(false), [dlg, setDlg] = useState(null), [me, setMe] = useState(ME0), [ptab, setPtab] = useState("view");
  const [prefs, setPrefs] = useState({}), [sys, setSys] = useState({ admin: false, auto: true }), [edit, setEdit] = useState({}), [acct, setAcct] = useState(""), [rep, setRep] = useState({ key: "billing", from: "", to: "" });
  const [cf, setCf] = useState({ cat: "Food", desc: "", amt: "" }), [rf, setRf] = useState({ no: "", amt: "", reason: "" });
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 30000), l = setTimeout(() => setLoading(false), 500); return () => { clearInterval(t); clearTimeout(l); }; }, []);
  if (loading) return <div className="bd"><p className="empty" style={{ padding: 60 }}>Loading billing data…</p></div>;

  const admin = sys.admin;
  const toast = (msg, kind = "ok") => { const id = Math.random(); setToasts((t) => [...t, { id, msg, kind }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200); };
  const audit = (action, ref, prev, next) => setAudits((a) => [{ who: me.name, action, at: stamp(), ref, prev, next }, ...a]);
  const act = (text, who, status = "Done") => setActs((a) => [[text, who, me.name, clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }), status], ...a].slice(0, 10));
  const note = (type, text) => setNotes((n) => [{ id: Math.random(), type, text, time: clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }), read: false }, ...n]);
  const go = (v, extra) => { setView(v); setMenu(false); if (v !== "create") setStartId(""); extra && extra(); };

  const allPays = bills.flatMap((b) => b.payments.map((p) => ({ ...p, guest: b.guest, room: b.room, no: b.no })));
  const paidPays = allPays.filter((p) => p.status === "Paid");
  const collectedOn = (d) => sum(paidPays.filter((p) => p.date === d), (p) => p.amt);
  const unsettled = bills.filter((b) => balOf(b) > 0), overdueB = unsettled.filter((b) => statusOf(b) === "overdue");
  const outstanding = sum(unsettled, (b) => balOf(b)), processing = allPays.filter((p) => p.status === "Processing");
  const live = guests.filter((g) => g.stage !== "done"), awaiting = guests.filter((g) => g.stage === "inhouse" || g.stage === "checkout");
  const billOf = (g) => bills.find((b) => b.gid === g.id);
  const visNotes = notes.filter((n) => prefs[n.type] !== false), unread = visNotes.filter((n) => !n.read).length;
  const todayBills = bills.filter((b) => b.date === iso()), todayRef = refunds.filter((r) => r.status === "Processed" && r.date === iso());

  /* ----- workflow actions ----- */
  const startBill = (id) => { setStartId(id); setView("create"); };
  const generate = (g, data) => {
    const no = Math.max(...bills.map((b) => b.no)) + 1;
    setBills([{ no, gid: g.id, guest: g.guest, phone: g.phone, room: g.room, bk: g.bk, date: iso(), due: iso(g.outD === 0 ? 0 : 2), by: me.name, payments: [], ...data }, ...bills]);
    setGuests(guests.map((x) => (x.id === g.id ? { ...x, stage: "billed" } : x)));
    audit("Bill created", `INV-${no}`, "-", inr(data.total)); if (data.discount > 0) audit("Discount added", `INV-${no}`, "₹0", inr(data.discount));
    act(`Invoice INV-${no} created`, `${g.guest} · Room ${g.room}`); note("Billing", `Guest account updated: INV-${no} for Room ${g.room}`); toast(`Invoice INV-${no} generated`); setStartId(""); setView("pending"); setOpenNo(no);
  };
  const addCharge = (g) => {
    const amt = Number(cf.amt); if (!(amt > 0)) return toast("Enter a valid amount", "err");
    const x = X(Date.now(), cf.cat, cf.desc || cf.cat, amt, `Today ${clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`, me.name);
    setGuests(guests.map((y) => (y.id === g.id ? { ...y, extras: [...y.extras, x] } : y)));
    audit("Charge added", `${g.bk} · Room ${g.room}`, "-", `${cf.cat} ${inr(amt)}`); act(`Charge added: ${cf.cat} ${inr(amt)}`, `${g.guest} · Room ${g.room}`); toast("Charge added"); setCf({ cat: "Food", desc: "", amt: "" }); setDlg(null);
  };
  const completeCheckout = (g) => {
    if (!g || g.stage === "done") return;
    setGuests((gs) => gs.map((x) => (x.id === g.id ? { ...x, stage: "done" } : x)));
    setHk((h) => [{ room: g.room, status: "Checkout / Cleaning Required", at: stamp() }, ...h.filter((x) => x.room !== g.room)]);
    audit("Checkout completed", g.bk, "Billed", "Checked out"); act(`Guest checkout completed · front desk notified`, `${g.guest} · Room ${g.room}`); note("Checkout", `Checkout completed: Room ${g.room}. Housekeeping task created.`); toast(`Checkout complete. Room ${g.room} sent to housekeeping.`);
    const set = (s) => setHk((h) => h.map((x) => (x.room === g.room ? { ...x, status: s } : x)));
    setTimeout(() => set("Cleaning In Progress"), 5000); setTimeout(() => { set("Ready"); act(`Room ${g.room} marked ready by housekeeping`, "Housekeeping", "Done"); }, 12000);
  };
  const afterPaid = (b) => {
    if (balOf(b) > 0) { note("Partial", `Partial payment on INV-${b.no}. Balance ${inr(balOf(b))}`); return toast(`Partial payment recorded. Balance ${inr(balOf(b))}`); }
    audit("Invoice settled", `INV-${b.no}`, "Unsettled", "Paid"); act(`Invoice INV-${b.no} settled`, `${b.guest} · Room ${b.room}`); note("Payment", `Payment received: INV-${b.no} settled. Front desk notified.`); toast("Payment successful. Receipt generated.");
    const g = guests.find((x) => x.id === b.gid); if (sys.auto) completeCheckout(g);
  };
  const recordPay = (no, { mode, amt, ref }) => {
    const b = bills.find((x) => x.no === no), status = mode === "Cash" ? "Paid" : "Processing";
    const p = { id: `PAY-${6000 + allPays.length}`, mode, amt, ref: ref || (mode === "Cash" ? "-" : `TXN${Date.now() % 1e8}`), date: iso(), time: clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }), by: me.name, status };
    const nb = bills.map((x) => (x.no === no ? { ...x, payments: [...x.payments, p] } : x)); setBills(nb);
    audit("Payment recorded", `INV-${no}`, inr(paidOf(b)), inr(paidOf(b) + (status === "Paid" ? amt : 0)));
    act(`Payment ${status === "Paid" ? "received" : "submitted"} ${inr(amt)}`, `${b.guest} · Room ${b.room}`, status);
    status === "Paid" ? afterPaid(nb.find((x) => x.no === no)) : (note("Verification", `Payment verification required: ${p.id}`), toast("Payment recorded. Verify it to settle the bill."));
  };
  const setPay = (no, pid, status) => {
    const nb = bills.map((x) => (x.no === no ? { ...x, payments: x.payments.map((p) => (p.id === pid ? { ...p, status } : p)) } : x)); setBills(nb);
    audit(status === "Paid" ? "Payment verified" : "Payment failed", `INV-${no}`, "Processing", status);
    if (status === "Paid") { act(`Payment ${pid} verified`, bills.find((b) => b.no === no).guest); afterPaid(nb.find((x) => x.no === no)); } else { note("Failed", `Payment failed: ${pid}`); toast("Payment marked failed", "err"); }
  };
  const deletePay = (no, pid) => {
    const b = bills.find((x) => x.no === no), p = b.payments.find((x) => x.id === pid);
    if (!p || p.status === "Paid") return toast("Paid payments can't be deleted. Use a refund.", "err");
    setBills(bills.map((x) => (x.no === no ? { ...x, payments: x.payments.filter((y) => y.id !== pid) } : x)));
    audit("Payment deleted", `INV-${no}`, `${pid} ${inr(p.amt)}`, "Deleted"); act(`Payment ${pid} deleted`, b.guest); toast("Payment deleted");
  };
  const editBill = (no, ed) => {
    const b = bills.find((x) => x.no === no), disc = { type: "₹", val: ed.disc }, t = totals(b.lines, b.svc, b.taxPct, disc, ed.fee);
    setBills(bills.map((x) => (x.no === no ? { ...x, disc, ...t } : x))); audit("Bill edited", `INV-${no}`, inr(b.total), inr(t.total)); act(`Bill INV-${no} updated`, b.guest); toast("Bill updated");
  };
  const cancelBill = (no) => {
    const b = bills.find((x) => x.no === no); setBills(bills.filter((x) => x.no !== no)); setGuests(guests.map((g) => (g.id === b.gid ? { ...g, stage: g.outD === 0 ? "checkout" : "inhouse" } : g)));
    audit("Invoice cancelled", `INV-${no}`, inr(b.total), "Cancelled"); act(`Invoice INV-${no} cancelled`, b.guest); setOpenNo(null); toast("Invoice cancelled");
  };
  const send = (b, what = "Invoice sent to guest") => { act(`${what}: INV-${b.no}`, b.guest); toast(`${what}`); };
  const requestRefund = () => {
    const b = bills.find((x) => x.no === Number(rf.no)), amt = Number(rf.amt);
    if (!b || !(amt > 0) || amt > paidOf(b) || !rf.reason.trim()) return toast("Choose an invoice, a valid amount and a reason", "err");
    const r = { id: `RF-${300 + refunds.length + 1}`, no: b.no, guest: b.guest, amt, reason: rf.reason, mode: b.payments[0]?.mode || "Cash", by: me.name, appr: "", date: iso(), status: "Pending Approval" };
    setRefunds([r, ...refunds]); audit("Refund requested", `INV-${b.no}`, "-", inr(amt)); note("Refund", `Refund requested: ${r.id} ${inr(amt)}`); act(`Refund requested ${r.id}`, b.guest, "Pending"); toast("Refund sent for approval"); setRf({ no: "", amt: "", reason: "" }); setDlg(null);
  };
  const setRefund = (id, status) => {
    setRefunds(refunds.map((r) => (r.id === id ? { ...r, status, appr: status === "Approved" || status === "Rejected" ? me.name : r.appr, date: status === "Processed" ? iso() : r.date } : r)));
    audit(status === "Processed" ? "Refund processed" : status === "Approved" ? "Refund approved" : "Refund rejected", id, "-", status); toast(`Refund ${status.toLowerCase()}`); note("Refund", `Refund ${id} ${status.toLowerCase()}`);
  };

  /* ----- derived views ----- */
  const g2 = (g) => ({ ...g, nights: Math.max(1, g.outD - g.inD), est: estOf(g) });
  const pendG = live.map(g2).filter((g) => (pf.when === "all" || (pf.when === "today" ? g.outD === 0 : g.outD === 1)) && (!pf.room || String(g.room).includes(pf.room)) && g.guest.toLowerCase().includes(pf.guest.toLowerCase()) && pf.status === "all")
    .sort((a, b) => (pf.sort === "amount" ? b.est - a.est : a.outD - b.outD));
  const pendB = unsettled.filter((b) => (pf.when === "all" || b.due === iso(pf.when === "today" ? 0 : 1)) && (!pf.room || String(b.room).includes(pf.room)) && b.guest.toLowerCase().includes(pf.guest.toLowerCase()) && (pf.status === "all" || statusOf(b) === pf.status))
    .sort((a, b) => (pf.sort === "amount" ? balOf(b) - balOf(a) : pf.sort === "due" ? (a.due < b.due ? -1 : 1) : pf.sort === "priority" ? (statusOf(a) === "overdue" ? -1 : 1) : a.room - b.room));
  const s = q.trim().toLowerCase();
  const filtered = bills.filter((b) => (!s || b.guest.toLowerCase().includes(s) || String(b.room).includes(s) || `inv-${b.no}`.includes(s) || b.bk.toLowerCase().includes(s) || b.phone.replace(/\s/g, "").includes(s.replace(/\s/g, "")) || b.payments.some((p) => p.id.toLowerCase().includes(s)))
    && (flt.status === "all" || statusOf(b) === flt.status) && (!flt.room || String(b.room).includes(flt.room)) && (!flt.from || b.date >= flt.from) && (!flt.to || b.date <= flt.to))
    .sort((a, b) => (flt.sort === "old" ? a.no - b.no : flt.sort === "total" ? b.total - a.total : flt.sort === "bal" ? balOf(b) - balOf(a) : b.no - a.no));
  const PAGE = 5, pageRows = filtered.slice(hp * PAGE, hp * PAGE + PAGE);
  const dayBills = bills.filter((b) => b.date === day), dayPays = paidPays.filter((p) => p.date === day && (rv.mode === "all" || p.mode === rv.mode));
  const dLines = dayBills.flatMap((b) => b.lines).filter((l) => rv.cat === "all" || l.cat === rv.cat);
  const roomRev = sum(dLines.filter((l) => l.cat === "Room"), (l) => l.amt), svcRev = sum(dLines.filter((l) => l.cat !== "Room"), (l) => l.amt);
  const dayRef = sum(refunds.filter((r) => r.status === "Processed" && r.date === day), (r) => r.amt);
  const byMode = MODES.map((m) => [m, sum(paidPays.filter((p) => p.date === day && p.mode === m), (p) => p.amt)]);
  const byCat = ["Room", ...CATS].map((c) => [c, sum(dayBills.flatMap((b) => b.lines).filter((l) => l.cat === c), (l) => l.amt)]).filter(([, v]) => v > 0);
  const series = Array.from({ length: rv.range }, (_, i) => iso(-(rv.range - 1 - i))).map((d) => [d, collectedOn(d)]);
  const mx = (a) => Math.max(1, ...a.map(([, v]) => v));
  const rb = bills.filter((b) => (!rep.from || b.date >= rep.from) && (!rep.to || b.date <= rep.to));
  const byDay = (n) => Array.from({ length: n }, (_, i) => iso(-(n - 1 - i))).map((d) => [fmtDay(d), inr(sum(bills.filter((b) => b.date === d), (b) => b.total)), inr(collectedOn(d))]);
  const REPS = {
    daily: ["Daily Revenue", ["Date", "Billed", "Collected"], byDay(1)], weekly: ["Weekly Revenue", ["Date", "Billed", "Collected"], byDay(7)], monthly: ["Monthly Revenue", ["Date", "Billed", "Collected"], byDay(30)],
    billing: ["Billing Summary", ["Invoice", "Guest", "Room", "Total", "Status"], rb.map((b) => [`INV-${b.no}`, b.guest, b.room, inr(b.total), LABEL[statusOf(b)]])],
    payment: ["Payment Summary", ["Mode", "Payments", "Amount"], MODES.map((m) => { const p = paidPays.filter((x) => x.mode === m); return [m, p.length, inr(sum(p, (x) => x.amt))]; })],
    outstanding: ["Outstanding Balance", ["Invoice", "Guest", "Balance", "Due"], rb.filter((b) => balOf(b) > 0).map((b) => [`INV-${b.no}`, b.guest, inr(balOf(b)), fmtDay(b.due)])],
    refund: ["Refund Report", ["Refund", "Invoice", "Amount", "Status"], refunds.map((r) => [r.id, `INV-${r.no}`, inr(r.amt), r.status])],
    tax: ["Tax Report", ["Invoice", "GST %", "GST"], rb.map((b) => [`INV-${b.no}`, `${b.taxPct}%`, inr(b.tax)])], discount: ["Discount Report", ["Invoice", "Discount"], rb.filter((b) => b.discount > 0).map((b) => [`INV-${b.no}`, inr(b.discount)])],
    room: ["Room Revenue", ["Invoice", "Room", "Room revenue"], rb.map((b) => [`INV-${b.no}`, b.room, inr(sum(b.lines.filter((l) => l.cat === "Room"), (l) => l.amt))])],
    service: ["Service Revenue", ["Invoice", "Service revenue"], rb.map((b) => [`INV-${b.no}`, inr(sum(b.lines.filter((l) => l.cat !== "Room"), (l) => l.amt))])],
    staff: ["Staff Billing Activity", ["Staff", "Bills", "Audit actions"], [[me.name, bills.filter((b) => b.by === me.name).length, audits.length]]],
  };
  const [rTitle, rCols, rRows] = REPS[rep.key];
  const exportCsv = () => { const csv = [rCols, ...rRows].map((r) => r.join(",")).join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `${rep.key}-report.csv`; a.click(); toast("CSV exported"); };
  const names = [...new Set([...guests.map((g) => g.guest), ...bills.map((b) => b.guest)])];
  const aName = acct || names[0], aG = guests.find((g) => g.guest === aName), aB = bills.filter((b) => b.guest === aName), aR = refunds.filter((r) => aB.some((b) => b.no === r.no));
  const openBill = bills.find((b) => b.no === openNo);
  const dateLabel = clock.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }), timeLabel = clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  const GuestCard = ({ g }) => {
    const b = billOf(g), today = g.outD === 0 && g.stage !== "done", nights = Math.max(1, g.outD - g.inD), extra = sum(g.extras, (e) => e.amt), [more, setMore] = useState(false);
    return (
      <div className={`gcard ${today ? "t-red" : "t-blue"}`} style={{ ...S.card, borderLeft: `5px solid ${today ? "#c0392b" : "#c9a227"}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b className="mono" style={{ fontSize: "1.3rem" }}>{g.room}</b><Pill t={stageLabel(g, b)} tone={g.stage === "done" || (b && balOf(b) <= 0) ? "paid" : today ? "pending" : "partial"} /></div>
        <strong>{g.guest}</strong><small className="muted">{g.type} · {g.bk} · {g.phone}</small>
        <small>In {fmtDay(iso(g.inD))} → Out {fmtDay(iso(g.outD))} · {nights} night{nights > 1 ? "s" : ""}</small>
        <small>Room {inr(g.rate * nights)} · Services {inr(extra)} · <b>{b ? `Billed ${inr(b.total)}` : `Est. ${inr(estOf(g))}`}</b></small>
        {more && <ul className="lines">{g.extras.length ? g.extras.map((e) => <li key={e.id}><span>{e.cat} · {e.desc}<small className="block">{e.at} · {e.by}</small></span>{inr(e.amt)}</li>) : <li className="empty">No additional services.</li>}</ul>}
        <div style={S.acts}>
          <button className="btn-line" onClick={() => go("accounts", () => setAcct(g.guest))}>View guest</button><button className="btn-line" onClick={() => setMore(!more)}>{more ? "Hide stay" : "View stay"}</button>
          {g.stage !== "done" && !b && <button className="btn-line" onClick={() => setDlg({ t: "charge", g })}>Add charges</button>}
          {!b && <button className="btn-gold" onClick={() => startBill(g.id)}>Create bill</button>}
          {b && <button className="btn-line" onClick={() => setOpenNo(b.no)}>View invoice</button>}
          {b && balOf(b) > 0 && <button className="btn-gold" onClick={() => setOpenNo(b.no)}>Collect payment</button>}
          {b && balOf(b) <= 0 && g.stage !== "done" && <button className="btn-navy" onClick={() => completeCheckout(g)}>Complete checkout</button>}
        </div>
      </div>
    );
  };
  const Grid = ({ list, empty }) => (list.length ? <div style={S.grid}>{list.map((g) => <GuestCard key={g.id} g={g} />)}</div> : <p className="empty">{empty}</p>);

  return (
    <div className="bd">
      <header className="top">
        <div className="brand"><span className="logo"><Icon d="M7 14a3 3 0 100-6 3 3 0 000 6zM10 11h10M17 11v3M20 11v2" /></span><div><h1>{HOTEL.name}</h1><small>Billing Desk Dashboard</small></div></div>
        <input className="search" type="search" aria-label="Search" placeholder="Search guest, phone, booking, room, invoice, payment ID" value={q} onChange={(e) => { setQ(e.target.value); setHp(0); setView("history"); }} />
        <button className="btn-outline" onClick={() => go("create")}>+ New Bill</button>
        <div className="clock"><span>{dateLabel}</span><b>{timeLabel}</b></div>
        <button className="bell" onClick={() => go("notifications")} aria-label={`${unread} unread notifications`}><Icon d={BELL} />{unread > 0 && <em>{unread}</em>}</button>
        <div style={{ position: "relative" }}>
          <button className="user" style={{ cursor: "pointer", background: "none", border: 0, font: "inherit", color: "inherit" }} onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}><span className="avatar"><Icon d={NAV[7][2]} /></span><span><b>{me.name}</b><small className="block">{me.role}</small></span></button>
          {menu && (<><div style={{ position: "fixed", inset: 0, zIndex: 30 }} onClick={() => setMenu(false)} />
            <div style={S.dd} role="menu">
              {[["View Profile", "view"], ["Edit Profile", "edit"]].map(([l, t]) => <button key={t} className="ddi" style={S.ddi} role="menuitem" onClick={() => go("profile", () => setPtab(t))}>{l}</button>)}
              <button className="ddi" style={S.ddi} role="menuitem" onClick={() => go("settings")}>Settings</button></div></>)}
        </div>
      </header>

      <div className="body">
        <aside className="side"><nav aria-label="Billing sections">
          {NAV.map(([k, l, d]) => (
            <button key={k} className={`nav ${view === k ? "is-on" : ""}`} onClick={() => go(k)} aria-current={view === k ? "page" : undefined}>
              <Icon d={d} /><span>{l}</span>
              {k === "pending" && awaiting.length + unsettled.length > 0 && <em className="badge">{awaiting.length + unsettled.length}</em>}
              {k === "refunds" && refunds.filter((r) => r.status === "Pending Approval").length > 0 && <em className="badge">{refunds.filter((r) => r.status === "Pending Approval").length}</em>}
            </button>))}
        </nav></aside>

        <main className={`page v-${view}`}>
          {view === "overview" && (<>
            <div className="stats">
              <Stat label="Awaiting billing" value={awaiting.length} sub={`${awaiting.filter((g) => g.outD === 0).length} checking out today`} tone="blue" onClick={() => go("pending")} />
              <Stat label="Outstanding" value={inr(outstanding)} sub={`${unsettled.length} unsettled invoices`} tone="red" onClick={() => go("pending")} />
              <Stat label="Collected today" value={inr(collectedOn(iso()))} sub={`${paidPays.filter((p) => p.date === iso()).length} payments`} tone="green" onClick={() => go("payments")} />
              <Stat label="Bills today" value={todayBills.length} sub={`${inr(sum(todayBills, (b) => b.total))} billed`} tone="gold" onClick={() => go("history")} />
            </div>
            <div className="cols">
              <section className="panel"><p className="kicker">Next to bill</p><h3>Guests</h3>
                {live.length ? <ul className="lines">{live.map(g2).sort((a, b) => a.outD - b.outD).slice(0, 3).map((g) => (
                  <li key={g.id}><span><b>Room {g.room}</b> · {g.guest}<small className="block">{g.outD === 0 ? "Checking out today" : `Out ${fmtDay(iso(g.outD))}`}</small></span>
                    <button className="btn-gold" style={{ padding: "6px 14px" }} onClick={() => (billOf(g) ? setOpenNo(billOf(g).no) : startBill(g.id))}>{billOf(g) ? "Open" : "Bill"}</button></li>))}</ul>
                  : <p className="empty">All guests are billed and checked out.</p>}
                <button className="link" onClick={() => go("pending")}>View all</button></section>
              <section className="panel"><p className="kicker">Recent activity</p><h3>Latest events</h3>
                <ul className="lines">{acts.slice(0, 4).map(([t, who, by, tm, st], i) => <li key={i}><span>{t}<small className="block">{who} · {tm}</small></span><Pill t={st} tone={st === "Done" ? "paid" : "pending"} /></li>)}</ul></section>
            </div>
          </>)}

          {view === "pending" && (<>
            <section className="panel"><p className="kicker">Filters</p>
              <div className="filters">
                <select aria-label="When" value={pf.when} onChange={(e) => setPf({ ...pf, when: e.target.value })}><option value="all">All dates</option><option value="today">Today</option><option value="tomorrow">Tomorrow</option></select>
                <input placeholder="Room" value={pf.room} onChange={(e) => setPf({ ...pf, room: e.target.value })} /><input placeholder="Guest" value={pf.guest} onChange={(e) => setPf({ ...pf, guest: e.target.value })} />
                <select aria-label="Status" value={pf.status} onChange={(e) => setPf({ ...pf, status: e.target.value })}><option value="all">All statuses</option>{["pending", "partial", "overdue", "disputed"].map((k) => <option key={k} value={k}>{LABEL[k]}</option>)}</select>
                <select aria-label="Sort" value={pf.sort} onChange={(e) => setPf({ ...pf, sort: e.target.value })}><option value="checkout">Sort: checkout time</option><option value="amount">Sort: amount</option><option value="priority">Sort: priority</option><option value="due">Sort: due date</option></select>
                <button className="link" onClick={() => setPf({ when: "all", room: "", guest: "", status: "all", sort: "checkout" })}>Clear</button></div></section>
            <section className="panel"><p className="kicker">Not billed yet</p><h3>Guests awaiting billing</h3><Grid list={pendG} empty="No guests match." /></section>
            <section className="panel"><p className="kicker">Needs follow-up</p><h3>Unsettled invoices</h3>
              <BillTable rows={pendB} onOpen={setOpenNo} empty="No unsettled invoices match." extra={(b) => <button className="btn-line" onClick={() => send(b, "Payment reminder sent")}>Remind</button>} /></section>
          </>)}

          {view === "create" && <Editor guests={awaiting} startId={startId} admin={admin} onGenerate={generate} />}

          {view === "history" && (
            <section className="panel"><p className="kicker">All invoices</p><h3>Billing history</h3>
              <div className="filters">
                <select aria-label="Status" value={flt.status} onChange={(e) => { setFlt({ ...flt, status: e.target.value }); setHp(0); }}><option value="all">All statuses</option>{Object.entries(LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <input placeholder="Room no." value={flt.room} onChange={(e) => { setFlt({ ...flt, room: e.target.value }); setHp(0); }} />
                <label>From<input type="date" value={flt.from} onChange={(e) => setFlt({ ...flt, from: e.target.value })} /></label><label>To<input type="date" value={flt.to} onChange={(e) => setFlt({ ...flt, to: e.target.value })} /></label>
                <select aria-label="Sort" value={flt.sort} onChange={(e) => setFlt({ ...flt, sort: e.target.value })}><option value="new">Newest first</option><option value="old">Oldest first</option><option value="total">Highest total</option><option value="bal">Highest balance</option></select>
                <button className="link" onClick={() => { setFlt({ status: "all", from: "", to: "", room: "", sort: "new" }); setQ(""); setHp(0); }}>Clear</button></div>
              <p className="muted">{filtered.length} of {bills.length} invoices{q && ` matching “${q}”`}</p>
              <BillTable rows={pageRows} staff icons onOpen={setOpenNo} extra={(b) => (<><IconBtn k="print" label="Print invoice" onClick={() => { setOpenNo(b.no); setTimeout(() => window.print(), 400); }} />
                <IconBtn k="send" label="Send to guest" onClick={() => send(b)} />{paidOf(b) > 0 && <IconBtn k="refund" label="Request refund" onClick={() => setDlg({ t: "refund", no: b.no })} />}
                {paidOf(b) === 0 && <IconBtn k="del" tone="danger" label="Delete invoice" onClick={() => window.confirm(`Delete invoice INV-${b.no}?`) && cancelBill(b.no)} />}</>)} />
              <Pager n={filtered.length} page={hp} set={setHp} size={PAGE} /></section>
          )}

          {view === "payments" && (
            <section className="panel"><p className="kicker">All payments</p><h3>Payments</h3>
              {allPays.some((p) => p.status === "Failed") && <p style={{ color: "#a12b24", margin: 0 }} role="alert">Some payments failed. Contact the guest to retry.</p>}
              <div className="filters">
                <select aria-label="Status" value={py.status} onChange={(e) => setPy({ ...py, status: e.target.value })}><option value="all">All statuses</option>{["Paid", "Processing", "Failed"].map((x) => <option key={x}>{x}</option>)}</select>
                <select aria-label="Mode" value={py.mode} onChange={(e) => setPy({ ...py, mode: e.target.value })}><option value="all">All methods</option>{MODES.map((m) => <option key={m}>{m}</option>)}</select>
                <select aria-label="Record payment for invoice" value="" onChange={(e) => e.target.value && setOpenNo(Number(e.target.value))}><option value="">Record payment…</option>{unsettled.map((b) => <option key={b.no} value={b.no}>INV-{b.no} · {b.guest} · {inr(balOf(b))}</option>)}</select></div>
              <div className="scroll"><table><thead><tr><th>Payment</th><th>Invoice</th><th>Guest</th><th>Room</th><th className="r">Amount</th><th>Method</th><th>Transaction</th><th>Date/time</th><th>Staff</th><th>Status</th><th /></tr></thead>
                <tbody>{allPays.filter((p) => (py.status === "all" || p.status === py.status) && (py.mode === "all" || p.mode === py.mode)).map((p) => (
                  <tr key={p.id}><td className="mono">{p.id}</td><td className="mono">INV-{p.no}</td><td>{p.guest}</td><td>{p.room}</td><td className="r">{inr(p.amt)}</td><td>{p.mode}</td><td className="mono">{p.ref}</td><td>{fmtDay(p.date)} {p.time}</td><td>{p.by}</td><td><Pill t={p.status} tone={p.status === "Paid" ? "paid" : p.status === "Failed" ? "pending" : "partial"} /></td>
                    <td className="r"><span style={S.acts}>{p.status === "Processing" && <IconBtn k="verify" tone="green" label="Verify payment" onClick={() => setPay(p.no, p.id, "Paid")} />}<IconBtn k="view" label="View invoice" onClick={() => setOpenNo(p.no)} />{p.status !== "Paid" && <IconBtn k="del" tone="danger" label="Delete payment" onClick={() => window.confirm(`Delete payment ${p.id}?`) && deletePay(p.no, p.id)} />}</span></td></tr>))}</tbody></table></div></section>
          )}

          {view === "refunds" && (
            <section className="panel"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><p className="kicker">Authorisation required</p><h3>Refunds</h3></div><button className="btn-gold" style={{ padding: "10px 20px" }} onClick={() => setDlg({ t: "refund", no: "" })}>Request refund</button></div>
              {!refunds.length ? <p className="empty">No refunds yet.</p> : <div className="scroll"><table><thead><tr><th>Refund</th><th>Invoice</th><th>Guest</th><th className="r">Amount</th><th>Reason</th><th>Method</th><th>Requested by</th><th>Approved by</th><th>Date</th><th>Status</th><th /></tr></thead>
                <tbody>{refunds.map((r) => (<tr key={r.id}><td className="mono">{r.id}</td><td className="mono">INV-{r.no}</td><td>{r.guest}</td><td className="r">{inr(r.amt)}</td><td>{r.reason}</td><td>{r.mode}</td><td>{r.by}</td><td>{r.appr || "-"}</td><td>{fmtDay(r.date)}</td>
                  <td><Pill t={r.status} tone={r.status === "Processed" ? "paid" : r.status === "Rejected" ? "pending" : "partial"} /></td>
                  <td className="r"><span style={S.acts}>{r.status === "Pending Approval" && (admin ? <><button className="btn-line" onClick={() => setRefund(r.id, "Approved")}>Approve</button><button className="btn-line" onClick={() => setRefund(r.id, "Rejected")}>Reject</button></> : <small className="muted">Awaiting admin</small>)}
                    {r.status === "Approved" && <button className="btn-navy" style={{ width: "auto", padding: "6px 14px" }} onClick={() => setRefund(r.id, "Processed")}>Process</button>}</span></td></tr>))}</tbody></table></div>}</section>
          )}

          {view === "revenue" && (<>
            <section className="panel"><div className="filters">
              <label>Date<input type="date" value={day} max={iso()} onChange={(e) => setDay(e.target.value || iso())} /></label>
              <select aria-label="Payment method" value={rv.mode} onChange={(e) => setRv({ ...rv, mode: e.target.value })}><option value="all">All methods</option>{MODES.map((m) => <option key={m}>{m}</option>)}</select>
              <select aria-label="Category" value={rv.cat} onChange={(e) => setRv({ ...rv, cat: e.target.value })}><option value="all">All categories</option>{["Room", ...CATS].map((c) => <option key={c}>{c}</option>)}</select>
              <select aria-label="Range" value={rv.range} onChange={(e) => setRv({ ...rv, range: Number(e.target.value) })}><option value={7}>Weekly view</option><option value={30}>Monthly view</option></select></div></section>
            <div className="stats">
              <Stat label="Total revenue" value={inr(sum(dayBills, (b) => b.total))} sub={`${dayBills.length} invoices`} tone="gold" /><Stat label="Room revenue" value={inr(roomRev)} sub="Room charges" tone="blue" />
              <Stat label="Service revenue" value={inr(svcRev)} sub="Food, laundry, spa…" tone="blue" /><Stat label="Tax collected" value={inr(sum(dayBills, (b) => b.tax))} sub="GST on billed amount" tone="green" />
              <Stat label="Discounts" value={inr(sum(dayBills, (b) => b.discount))} sub="Given today" tone="red" /><Stat label="Refunds" value={inr(dayRef)} sub="Processed" tone="red" />
              <Stat label="Net revenue" value={inr(sum(dayBills, (b) => b.total) - dayRef)} sub="After refunds" tone="green" /><Stat label="Collected" value={inr(sum(dayPays, (p) => p.amt))} sub={`${dayPays.length} payments`} tone="green" />
            </div>
            <div className="cols">
              <section className="panel"><p className="kicker">Collected</p><h3>Payment method breakdown</h3>{byMode.map(([m, v]) => <div key={m} className="hbar"><span>{m}</span><div><i style={{ width: `${(v / mx(byMode)) * 100}%` }} /></div><b>{inr(v)}</b></div>)}
                <p className="kicker sp">Billed</p><h3>Room vs service revenue</h3>{[["Room", roomRev], ["Service", svcRev]].map(([m, v]) => <div key={m} className="hbar alt"><span>{m}</span><div><i style={{ width: `${(v / Math.max(1, roomRev, svcRev)) * 100}%` }} /></div><b>{inr(v)}</b></div>)}
                <h4>By category</h4>{byCat.length ? byCat.map(([c, v]) => <div key={c} className="hbar alt"><span>{c}</span><div><i style={{ width: `${(v / mx(byCat)) * 100}%` }} /></div><b>{inr(v)}</b></div>) : <p className="empty">No bills on this day.</p>}</section>
              <section className="panel"><p className="kicker">Last {rv.range} days</p><h3>Collections</h3>
                <div className="bars">{series.map(([d, v]) => <button key={d} className={`bar ${d === day ? "is-on" : ""}`} onClick={() => setDay(d)} aria-label={`${fmtDay(d)} ${inr(v)}`}><span style={{ height: `${(v / mx(series)) * 100}%` }} />{rv.range === 7 && <small>{fmtDay(d)}</small>}</button>)}</div>
                <h4>Payments on {fmtDay(day)}</h4><ul className="lines">{dayPays.length ? dayPays.map((p) => <li key={p.id}><span>{p.guest}<small className="block">INV-{p.no} · {p.mode}</small></span><b>{inr(p.amt)}</b></li>) : <li className="empty">No payments recorded.</li>}</ul></section>
            </div>
          </>)}

          {view === "accounts" && (
            <div className="cols">
              <section className="panel"><p className="kicker">Guests</p><h3>Accounts</h3><ul className="lines">{names.map((n) => <li key={n}><button className={`nav ${n === aName ? "is-on" : ""}`} style={{ width: "100%", color: "inherit" }} onClick={() => setAcct(n)}><span>{n}</span></button></li>)}</ul></section>
              <section className="panel"><p className="kicker">Financial history</p><h3>{aName}</h3>
                <p className="muted">{aG ? `${aG.phone} · ${aG.bk} · Room ${aG.room} (${aG.type}) · ${fmtDay(iso(aG.inD))} to ${fmtDay(iso(aG.outD))} · ${stageLabel(aG, billOf(aG))}` : "Previous guest"}</p>
                <dl className="calc"><dt>Room charges</dt><dd>{inr(sum(aB.flatMap((b) => b.lines.filter((l) => l.cat === "Room")), (l) => l.amt))}</dd><dt>Service charges</dt><dd>{inr(sum(aB.flatMap((b) => b.lines.filter((l) => l.cat !== "Room")), (l) => l.amt) + (aG && !billOf(aG) ? sum(aG.extras, (e) => e.amt) : 0))}</dd>
                  <dt>Discounts</dt><dd>{inr(sum(aB, (b) => b.discount))}</dd><dt>Payments</dt><dd>{inr(sum(aB, paidOf))}</dd><dt>Refunds</dt><dd>{inr(sum(aR.filter((r) => r.status === "Processed"), (r) => r.amt))}</dd><dt className="grand">Outstanding</dt><dd className="grand">{inr(sum(aB, balOf))}</dd></dl>
                <h4>Invoice history</h4><BillTable rows={aB} onOpen={setOpenNo} empty="No invoices yet." />
                <h4>Previous bookings</h4><ul className="lines">{aB.length ? aB.map((b) => <li key={b.no}><span>{b.bk} · Room {b.room}</span><span>{fmtDay(b.date)}</span></li>) : <li className="empty">None.</li>}</ul>
                <h4>Payment history</h4><ul className="lines">{aB.flatMap((b) => b.payments).map((p) => <li key={p.id}><span>{p.id} · {p.mode}</span><b>{inr(p.amt)}</b></li>)}</ul></section>
            </div>
          )}

          {view === "reports" && (
            <section className="panel"><p className="kicker">Reports</p><h3>{rTitle}</h3>
              <div className="filters">
                <select aria-label="Report" value={rep.key} onChange={(e) => setRep({ ...rep, key: e.target.value })}>{Object.entries(REPS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select>
                <label>From<input type="date" value={rep.from} onChange={(e) => setRep({ ...rep, from: e.target.value })} /></label><label>To<input type="date" value={rep.to} onChange={(e) => setRep({ ...rep, to: e.target.value })} /></label>
                <span style={S.acts}><button className="btn-line" onClick={() => window.print()}>Export PDF</button><button className="btn-line" onClick={exportCsv}>Export CSV</button><button className="btn-line" onClick={() => window.print()}>Print</button></span></div>
              {rRows.length ? <div className="scroll"><table><thead><tr>{rCols.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{rRows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div> : <p className="empty">No data for this period.</p>}
              {admin && (<><h4>Audit log</h4>{audits.length ? <div className="scroll"><table><thead><tr><th>User</th><th>Action</th><th>Date/time</th><th>Reference</th><th>Previous</th><th>New</th></tr></thead><tbody>{audits.map((a, i) => <tr key={i}><td>{a.who}</td><td>{a.action}</td><td>{a.at}</td><td>{a.ref}</td><td>{a.prev}</td><td>{a.next}</td></tr>)}</tbody></table></div> : <p className="empty">No audited actions yet.</p>}</>)}</section>
          )}

          {view === "notifications" && (
            <section className="panel"><div style={{ display: "flex", justifyContent: "space-between" }}><div><p className="kicker">{unread} unread</p><h3>Notifications</h3></div><button className="link" onClick={() => setNotes(notes.map((n) => ({ ...n, read: true })))}>Mark all read</button></div>
              {!visNotes.length ? <p className="empty">You're all caught up.</p> : <ul className="lines">{visNotes.map((n) => <li key={n.id} style={{ cursor: "pointer", fontWeight: n.read ? 400 : 600 }} onClick={() => setNotes(notes.map((x) => (x.id === n.id ? { ...x, read: true } : x)))}><span><Pill t={n.type} tone="partial" /> {n.text}</span><small className="muted">{n.time}</small></li>)}</ul>}</section>
          )}

          {view === "settings" && (
            <div className="cols">
              <section className="panel"><p className="kicker">Notifications</p><h3>Alerts</h3>
                <ul className="lines">{NTYPES.map((k) => <li key={k}><span>{k} alerts</span><input type="checkbox" checked={prefs[k] !== false} onChange={(e) => setPrefs({ ...prefs, [k]: e.target.checked })} /></li>)}</ul></section>
              <section className="panel"><p className="kicker">System</p><h3>Preferences</h3>
                <ul className="lines">
                  <li><span>Complete checkout automatically when settled</span><input type="checkbox" checked={sys.auto} onChange={(e) => setSys({ ...sys, auto: e.target.checked })} /></li>
                  <li><span>Demo: act as administrator</span><input type="checkbox" checked={sys.admin} onChange={(e) => setSys({ ...sys, admin: e.target.checked })} /></li></ul>
                <button className="btn-navy" onClick={() => setDlg({ t: "logout" })}>Logout</button></section>
            </div>
          )}

          {view === "profile" && (<>
            <section className="panel pcard"><span className="avatar big">{me.name.split(" ").map((w) => w[0]).join("")}</span>
              <div><h3>{me.name}</h3><small>{me.role} · {me.dept}</small></div></section>
            <div className="filters">{[["view", "View Profile"], ["edit", "Edit Profile"]].map(([k, l]) => <button key={k} className={ptab === k ? "btn-navy" : "btn-line"} style={ptab === k ? { width: "auto" } : undefined} onClick={() => { setPtab(k); setEdit({}); }}>{l}</button>)}</div>
            {ptab === "view" && <section className="panel"><dl className="calc">
              <dt>Employee ID</dt><dd>{me.id}</dd><dt>Department</dt><dd>{me.dept}</dd><dt>Email</dt><dd>{me.email}</dd><dt>Phone</dt><dd>{me.phone}</dd><dt>Joined</dt><dd>{me.joined}</dd></dl></section>}
            {ptab === "edit" && (<div className="cols">
              <section className="panel"><p className="kicker">Your details</p>
                {[["name", "Name"], ["email", "Email"], ["phone", "Phone"]].map(([k, l]) => <label key={k} className="fld">{l}<input value={edit[k] ?? me[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></label>)}
                <button className="btn-navy" onClick={() => { setMe({ ...me, ...edit }); setEdit({}); toast("Profile updated"); }}>Save changes</button></section>
              <section className="panel"><p className="kicker">Security</p><h3>Change password</h3>
                <PassForm pw={me.pw} onSave={(pw) => { setMe({ ...me, pw }); toast("Password changed"); }} /></section></div>)}
          </>)}
        </main>
      </div>

      {openBill && <BillModal bill={openBill} admin={admin} toast={toast} onClose={() => setOpenNo(null)} onPay={recordPay} onVerify={(n, id) => setPay(n, id, "Paid")} onFail={(n, id) => setPay(n, id, "Failed")} onSend={send} onEdit={editBill} onCancel={cancelBill} onDispute={(n) => setBills(bills.map((b) => (b.no === n ? { ...b, disputed: !b.disputed } : b)))} />}

      {dlg && (
        <div className="overlay" onClick={() => setDlg(null)}><div style={S.box} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          {dlg.t === "logout" && (<><h3>Are you sure you want to logout?</h3><div style={S.two}><button className="btn-line" onClick={() => setDlg(null)}>Cancel</button><button className="btn-navy" onClick={onLogout}>Logout</button></div></>)}
          {dlg.t === "charge" && (<><h3>Add charge · Room {dlg.g.room}</h3><label className="fld">Category<select value={cf.cat} onChange={(e) => setCf({ ...cf, cat: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="fld">Description<input value={cf.desc} onChange={(e) => setCf({ ...cf, desc: e.target.value })} /></label><label className="fld">Amount ₹<input type="number" min="0" value={cf.amt} onChange={(e) => setCf({ ...cf, amt: e.target.value })} /></label>
            <small className="muted">Recorded for {dlg.g.guest} · {dlg.g.bk} · by {me.name}</small><div style={S.two}><button className="btn-line" onClick={() => setDlg(null)}>Cancel</button><button className="btn-navy" onClick={() => addCharge(dlg.g)}>Add charge</button></div></>)}
          {dlg.t === "refund" && (<><h3>Request refund</h3><label className="fld">Invoice<select value={rf.no || dlg.no} onChange={(e) => setRf({ ...rf, no: e.target.value })}><option value="">Select…</option>{bills.filter((b) => paidOf(b) > 0).map((b) => <option key={b.no} value={b.no}>INV-{b.no} · {b.guest} · paid {inr(paidOf(b))}</option>)}</select></label>
            <label className="fld">Amount ₹<input type="number" min="1" value={rf.amt} onChange={(e) => setRf({ ...rf, amt: e.target.value })} /></label><label className="fld">Reason<input value={rf.reason} onChange={(e) => setRf({ ...rf, reason: e.target.value })} /></label>
            <small className="muted">Refunds are processed only after administrator approval.</small><div style={S.two}><button className="btn-line" onClick={() => setDlg(null)}>Cancel</button><button className="btn-navy" onClick={() => { if (!rf.no && dlg.no) rf.no = String(dlg.no); requestRefund(); }}>Submit request</button></div></>)}
        </div></div>)}
      <div style={S.toast} aria-live="polite">{toasts.map((t) => <div key={t.id} style={{ background: t.kind === "err" ? "#a12b24" : "#14214a", color: "#fff", padding: "12px 16px", borderRadius: 10, borderLeft: "5px solid #c9a227" }}>{t.msg}</div>)}</div>
    </div>
  );
}

function PassForm({ pw, onSave }) {
  const [f, setF] = useState({ cur: "", nw: "", cf: "" }), [m, setM] = useState("");
  const save = () => { if (f.cur !== pw) return setM("Current password is incorrect."); if (f.nw.length < 8) return setM("Use at least 8 characters."); if (f.nw !== f.cf) return setM("Passwords do not match."); onSave(f.nw); setF({ cur: "", nw: "", cf: "" }); setM(""); };
  return (<div style={{ display: "grid", gap: 10 }}>{[["cur", "Current password"], ["nw", "New password"], ["cf", "Confirm new password"]].map(([k, l]) => <label key={k} className="fld">{l}<input type="password" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>)}
    {m && <p style={{ color: "#a12b24", margin: 0 }}>{m}</p>}<button className="btn-navy" onClick={save}>Change password</button></div>);
}

export default function BillingDashboard() {
  const [auth, setAuth] = useState(true);
  return auth ? <Billing onLogout={() => setAuth(false)} /> : <Login onLogin={() => setAuth(true)} />;
}