import { useState, useMemo } from "react";
import "./Admindashboard.css";

const ROLES = ["Administrator", "Front Desk", "Housekeeping", "Accountant"];
const TYPES = ["Single", "Double", "Suite"];
const STATUS_COLOR = { Available: "#2f7d55", Occupied: "#3b66b5", Dirty: "#b83a3a" };
const PALETTE = ["#c9a227", "#3b66b5", "#2f7d55", "#b83a3a", "#7a4fb0"];

const seedUsers = [
  { id: 1, name: "Anita Menon", email: "anita@hotel.in", role: "Administrator", active: true },
  { id: 2, name: "Rohan Das", email: "rohan@hotel.in", role: "Front Desk", active: true },
  { id: 3, name: "Meera Nair", email: "meera@hotel.in", role: "Housekeeping", active: true },
  { id: 4, name: "Vikram Rao", email: "vikram@hotel.in", role: "Accountant", active: false },
];
const seedRooms = [
  { no: "101", type: "Single", floor: 1, rate: 2500, amenities: "AC, WiFi", status: "Available" },
  { no: "102", type: "Single", floor: 1, rate: 2500, amenities: "AC, WiFi", status: "Occupied" },
  { no: "201", type: "Double", floor: 2, rate: 3800, amenities: "AC, WiFi, TV", status: "Dirty" },
  { no: "202", type: "Double", floor: 2, rate: 3800, amenities: "AC, WiFi, TV", status: "Available" },
  { no: "301", type: "Suite", floor: 3, rate: 6500, amenities: "AC, WiFi, TV, Bathtub", status: "Available" },
];
const seedBookings = [
  { id: "B-1042", guest: "Arjun Pillai", room: "102", date: "2026-10-02", nights: 2, amount: 5600, status: "Checked in" },
  { id: "B-1043", guest: "Sara Thomas", room: "201", date: "2026-10-01", nights: 1, amount: 4256, status: "Checked out" },
  { id: "B-1044", guest: "Dev Kumar", room: "301", date: "2026-10-03", nights: 3, amount: 21840, status: "Reserved" },
];
const seedLog = [
  { id: 1, staff: "Rohan Das", action: "Created booking B-1044", at: "2026-10-02 07:34" },
  { id: 2, staff: "Meera Nair", action: "Marked room 201 as dirty", at: "2026-10-02 07:10" },
  { id: 3, staff: "Anita Menon", action: "Changed room 101 rate: 2,300 → 2,500", at: "2026-10-01 18:22" },
  { id: 4, staff: "Rohan Das", action: "Checked out Sara Thomas (B-1043)", at: "2026-10-01 11:05" },
];

const NAV = [
  ["overview", "▦", "Overview", "Today at a glance"],
  ["users", "☺", "User Management", "Staff accounts and roles"],
  ["rooms", "⌂", "Room Management", "Rooms by floor, rates and amenities"],
  ["records", "☰", "Guests & Bills", "All guest records, bookings and bills"],
  ["reports", "▥", "Reports", "Filter by date and export"],
  ["pricing", "₹", "Pricing & Tax", "Room rates, GST and service charge"],
  ["log", "✎", "Activity Log", "Who changed what, and when"],
];

const money = (n) => "Rs " + Number(n).toLocaleString("en-IN");
const initials = (n) => n.split(" ").map((w) => w[0]).join("").slice(0, 2);
const colorOf = (users, name) => PALETTE[Math.max(0, users.findIndex((u) => u.name === name)) % PALETTE.length];

function download(name, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name;
  a.click();
}

const Field = ({ label, children }) => <label>{label}{children}</label>;

function Sheet({ title, onClose, mid, children }) {
  return (
    <div className={"ad-scrim" + (mid ? " mid" : "")} onClick={onClose}>
      <div className="ad-sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="ad-bar">
          <h2>{title}</h2>
          <button className="ad-btn ghost sm" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Timeline({ items, users }) {
  return (
    <ul className="ad-tl">
      {items.map((l) => (
        <li key={l.id} style={{ "--c": colorOf(users, l.staff) }}>
          <b>{l.action}</b><small>{l.staff} · {l.at}</small>
        </li>
      ))}
      {!items.length && <li><b>No activity recorded yet.</b></li>}
    </ul>
  );
}

function FeedCards({ items, users }) {
  return (
    <div className="ad-feedcards">
      {items.map((l) => (
        <div className="ad-fc" key={l.id}>
          <span className="ad-av" style={{ background: colorOf(users, l.staff) }}>{initials(l.staff)}</span>
          <div><b>{l.action}</b><small>{l.staff}</small></div>
          <time>{l.at.slice(11)}<br /><small>{l.at.slice(5, 10)}</small></time>
        </div>
      ))}
    </div>
  );
}

function Ledger({ items, users }) {
  const days = [...new Set(items.map((l) => l.at.slice(0, 10)))];
  return (
    <div className="ad-ledger">
      {days.map((d) => (
        <section key={d}>
          <h3>{d}</h3>
          {items.filter((l) => l.at.startsWith(d)).map((l) => (
            <div className="ad-lrow" key={l.id}>
              <time>{l.at.slice(11)}</time>
              <span className="who" style={{ "--c": colorOf(users, l.staff) }}>{l.staff}</span>
              <span>{l.action}</span>
            </div>
          ))}
        </section>
      ))}
      {!days.length && <p className="ad-lempty">No activity recorded yet.</p>}
    </div>
  );
}

export default function AdminDashboard() {
  const [page, setPage] = useState("overview");
  const [users, setUsers] = useState(seedUsers);
  const [rooms, setRooms] = useState(seedRooms);
  const [log, setLog] = useState(seedLog);
  const [tax, setTax] = useState({ gst: 12, service: 0, rates: { Single: 2500, Double: 3800, Suite: 6500 } });
  const [edit, setEdit] = useState(null);
  const [viewStaff, setViewStaff] = useState(null);
  const [staffFilter, setStaffFilter] = useState("All");
  const [range, setRange] = useState({ from: "2026-10-01", to: "2026-10-03" });
  const [report, setReport] = useState("Occupancy");
  const [floorTab, setFloorTab] = useState("All");

  const me = "Anita Menon";
  const record = (action) =>
    setLog((l) => [{ id: Date.now(), staff: me, action, at: new Date().toISOString().slice(0, 16).replace("T", " ") }, ...l]);

  const stats = useMemo(() => {
    const c = (s) => rooms.filter((r) => r.status === s).length;
    return {
      occ: Math.round((c("Occupied") / rooms.length) * 100) || 0,
      Available: c("Available"), Occupied: c("Occupied"), Dirty: c("Dirty"),
      ins: seedBookings.filter((b) => b.date === "2026-10-02").length,
      outs: seedBookings.filter((b) => b.status === "Checked out").length,
    };
  }, [rooms]);

  const saveUser = () => {
    const u = edit.data;
    if (!u.name || !u.email) return;
    setUsers((x) => (u.id ? x.map((y) => (y.id === u.id ? u : y)) : [...x, { ...u, id: Date.now(), active: true }]));
    record(`${u.id ? "Edited" : "Created"} staff account ${u.name} (${u.role})`);
    setEdit(null);
  };
  const toggleUser = (u) => {
    setUsers((x) => x.map((y) => (y.id === u.id ? { ...y, active: !y.active } : y)));
    record(`${u.active ? "Deactivated" : "Reactivated"} staff account ${u.name}`);
  };
  const saveRoom = () => {
    const r = edit.data;
    if (!r.no) return;
    const isNew = !edit.orig;
    setRooms((x) => (isNew ? [...x, { ...r, floor: +r.floor, rate: +r.rate, status: "Available" }] : x.map((y) => (y.no === r.no ? { ...r, floor: +r.floor, rate: +r.rate } : y))));
    record(`${isNew ? "Added" : "Edited"} room ${r.no} (${r.type}, ${money(r.rate)})`);
    setEdit(null);
  };
  const set = (k) => (e) => setEdit((s) => ({ ...s, data: { ...s.data, [k]: e.target.value } }));

  const logRows = log.filter((l) => staffFilter === "All" || l.staff === staffFilter);
  const inRange = seedBookings.filter((b) => b.date >= range.from && b.date <= range.to);
  const rep = {
    Occupancy: { head: ["Room", "Type", "Status"], rows: rooms.map((r) => [r.no, r.type, r.status]),
      chart: ["Available", "Occupied", "Dirty"].map((s) => [s, stats[s]]) },
    Revenue: { head: ["Booking", "Guest", "Date", "Amount"], rows: inRange.map((b) => [b.id, b.guest, b.date, b.amount]),
      chart: inRange.map((b) => [b.id, b.amount]) },
    "Guest history": { head: ["Booking", "Guest", "Room", "Nights", "Status"], rows: inRange.map((b) => [b.id, b.guest, b.room, b.nights, b.status]),
      chart: inRange.map((b) => [b.guest.split(" ")[0], b.nights]) },
    Housekeeping: { head: ["Staff", "Rooms cleaned", "Avg. minutes"], rows: [["Meera Nair", 14, 22], ["Joseph K", 11, 27]],
      chart: [["Meera", 14], ["Joseph", 11]] },
  }[report];
  const max = Math.max(1, ...rep.chart.map((c) => c[1]));
  const cur = NAV.find((n) => n[0] === page);
  const taxPct = tax.gst + tax.service;
  const net = tax.rates.Single, taxAmt = Math.round((net * taxPct) / 100);
  const total = rooms.length || 1;

  return (
    <div className="ad">
      <aside className="ad-side">
        <div className="ad-logo"><i>H</i><div><b>VEYRA</b><small>Administrator console</small></div></div>
        <nav aria-label="Main">
          {NAV.map(([id, icon, label]) => (
            <button key={id} className={"ad-nav" + (page === id ? " on" : "")} onClick={() => setPage(id)}>
              <span className="ic" aria-hidden>{icon}</span><span>{label}</span>
              {id === "log" && <span className="ad-pill">{log.length}</span>}
            </button>
          ))}
        </nav>
        <div className="ad-me"><span className="ad-av">{initials(me)}</span><div>{me}<br /><small>Administrator</small></div></div>
      </aside>

      <main className="ad-main">
        <div className="ad-head">
          <div><h1>{cur[2]}</h1><p>{cur[3]}</p></div>
          <span className="ad-date">{new Date().toDateString()}</span>
        </div>

        {page === "overview" && (
          <>
            <div className="ad-row">
              <div className="ad-hero">
                <div className="ad-ring">
                  <svg width="170" height="170" viewBox="0 0 170 170">
                    <circle cx="85" cy="85" r="72" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="14" />
                    <circle cx="85" cy="85" r="72" fill="none" stroke="#e6c65c" strokeWidth="14" strokeLinecap="round"
                      strokeDasharray={`${(stats.occ / 100) * 452} 452`} />
                  </svg>
                  <b>{stats.occ}%</b>
                </div>
                <span>Occupancy rate today</span>
              </div>
              <div className="ad-tiles">
                {[["Available rooms", stats.Available, "#2f7d55"], ["Occupied rooms", stats.Occupied, "#3b66b5"], ["Dirty rooms", stats.Dirty, "#b83a3a"],
                  ["Check-ins today", stats.ins, "#c9a227"], ["Check-outs today", stats.outs, "#7a4fb0"], ["Total rooms", rooms.length, "#1b2a4e"]].map(([l, v, c]) => (
                  <div className="ad-tile" key={l} style={{ "--c": c }}><b>{v}</b><span>{l}</span></div>
                ))}
              </div>
            </div>
            <div className="ad-panel">
              <h2>Room status</h2>
              <div className="ad-split">
                {["Available", "Occupied", "Dirty"].map((s) => <i key={s} style={{ width: `${(stats[s] / total) * 100}%`, background: STATUS_COLOR[s] }} />)}
              </div>
              <div className="ad-legend">{["Available", "Occupied", "Dirty"].map((s) => <span key={s}><em style={{ "--c": STATUS_COLOR[s] }} />{s} ({stats[s]})</span>)}</div>
            </div>
            <div className="ad-panel"><h2 style={{ marginBottom: 18 }}>Recent activity</h2><FeedCards items={log.slice(0, 4)} users={users} /></div>
          </>
        )}

        {page === "users" && (
          <>
            <div className="ad-bar"><span /><button className="ad-btn" onClick={() => setEdit({ kind: "user", data: { name: "", email: "", role: ROLES[1] } })}>+ Create staff account</button></div>
            <div className="ad-cards">
              {users.map((u) => (
                <article key={u.id} className={"ad-user" + (u.active ? "" : " off")}>
                  <div className="top" />
                  <div className="ad-av">{initials(u.name)}</div>
                  <h3>{u.name}</h3><p>{u.email}</p>
                  <span className="ad-tag info">{u.role}</span>{" "}
                  <span className={"ad-tag " + (u.active ? "ok" : "off")}>{u.active ? "Active" : "Inactive"}</span>
                  <div className="acts">
                    <button className="ad-btn ghost sm" onClick={() => setEdit({ kind: "user", data: { ...u } })}>Edit</button>
                    <button className="ad-btn ghost sm" onClick={() => setViewStaff(u)}>View activity</button>
                    <button className={"ad-btn sm" + (u.active ? " danger" : "")} onClick={() => toggleUser(u)}>{u.active ? "Deactivate" : "Reactivate"}</button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {page === "rooms" && (
          <div className="ad-panel">
            <div className="ad-rm-top">
              {["Available", "Occupied", "Dirty"].map((s) => (
                <div key={s} style={{ "--c": STATUS_COLOR[s] }}><b>{stats[s]}</b><span>{s}</span></div>
              ))}
              <button className="ad-btn" onClick={() => setEdit({ kind: "room", orig: null, data: { no: "", type: "Single", floor: 1, rate: tax.rates.Single, amenities: "" } })}>+ Add room</button>
            </div>
            <div className="ad-chips">
              {["All", ...[...new Set(rooms.map((r) => r.floor))].sort()].map((f) => (
                <button key={f} className={String(floorTab) === String(f) ? "on" : ""} onClick={() => setFloorTab(f)}>{f === "All" ? "All floors" : `Floor ${f}`}</button>
              ))}
            </div>
            <div className="ad-tickets">
              {rooms.filter((r) => floorTab === "All" || r.floor === floorTab).map((r) => (
                <article className="ad-ticket" key={r.no} style={{ "--c": STATUS_COLOR[r.status] }}>
                  <div className="num"><b>{r.no}</b><small>Floor {r.floor}</small></div>
                  <div className="info">
                    <h3>{r.type} room</h3>
                    <p>{r.amenities}</p>
                    <div><strong>{money(r.rate)}</strong> <small>/ night</small></div>
                  </div>
                  <div className="side">
                    <span className="st"><i />{r.status}</span>
                    <button className="ad-btn ghost sm" onClick={() => setEdit({ kind: "room", orig: r.no, data: { ...r } })}>Edit</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {page === "records" && (
          <div className="ad-panel">
            <div className="ad-wrap">
              <table>
                <thead><tr>{["Booking", "Guest", "Room", "Check-in", "Nights", "Bill (incl. GST)", "Status"].map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {seedBookings.map((b) => (
                    <tr key={b.id}><td><b>{b.id}</b></td><td>{b.guest}</td><td>{b.room}</td><td>{b.date}</td><td>{b.nights}</td><td>{money(b.amount)}</td><td><span className="ad-tag">{b.status}</span></td></tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={5}>Total billed</td><td colSpan={2}>{money(seedBookings.reduce((s, b) => s + b.amount, 0))}</td></tr></tfoot>
              </table>
            </div>
          </div>
        )}

        {page === "reports" && (
          <div className="ad-panel">
            <div className="ad-tabs">{Object.keys({ Occupancy: 1, Revenue: 1, "Guest history": 1, Housekeeping: 1 }).map((t) => <button key={t} className={report === t ? "on" : ""} onClick={() => setReport(t)}>{t}</button>)}</div>
            <div className="ad-bar">
              <div className="ad-grid">
                <Field label="From"><input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
                <Field label="To"><input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
              </div>
              <button className="ad-btn" onClick={() => download(`${report}.csv`, [rep.head, ...rep.rows])}>Export CSV</button>
            </div>
            <div className="ad-chart">{rep.chart.map(([l, v]) => <div key={l}>{v}<i style={{ height: `${(v / max) * 82}%` }} /></div>)}</div>
            <div className="ad-labels">{rep.chart.map(([l]) => <span key={l}>{l}</span>)}</div>
            <div className="ad-wrap"><table><thead><tr>{rep.head.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{rep.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>
          </div>
        )}

        {page === "pricing" && (
          <>
            <div className="ad-rates">
              {TYPES.map((t) => (
                <div className="ad-rate" key={t}>
                  <h3>{t} room</h3>
                  <Field label="Rate (Rs / night)"><input type="number" value={tax.rates[t]} onChange={(e) => setTax({ ...tax, rates: { ...tax.rates, [t]: +e.target.value } })} /></Field>
                </div>
              ))}
            </div>
            <div className="ad-panel ad-two">
              <div>
                <h2 style={{ marginBottom: 16 }}>Tax configuration</h2>
                <div className="ad-grid">
                  <Field label="GST (%)"><input type="number" value={tax.gst} onChange={(e) => setTax({ ...tax, gst: +e.target.value })} /></Field>
                  <Field label="Service charge (%)"><input type="number" value={tax.service} onChange={(e) => setTax({ ...tax, service: +e.target.value })} /></Field>
                </div>
                <button className="ad-btn" onClick={() => record(`Updated pricing: GST ${tax.gst}%, service ${tax.service}%`)}>Save pricing</button>
              </div>
              <div className="ad-receipt">
                <h3 style={{ marginBottom: 10 }}>Sample bill: 1 night, Single</h3>
                <p><span>Room</span><span>{money(net)}</span></p>
                <p><span>Tax ({taxPct}%)</span><span>{money(taxAmt)}</span></p>
                <p className="t"><span>Total</span><span>{money(net + taxAmt)}</span></p>
              </div>
            </div>
          </>
        )}

        {page === "log" && (
          <div className="ad-panel">
            <div className="ad-bar">
              <div className="ad-grid"><Field label="Staff member"><select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}><option>All</option>{users.map((u) => <option key={u.id}>{u.name}</option>)}</select></Field></div>
              <button className="ad-btn ghost" onClick={() => download("audit-log.csv", [["Time", "Staff", "Action"], ...logRows.map((l) => [l.at, l.staff, l.action])])}>Export CSV</button>
            </div>
            <Ledger items={logRows} users={users} />
          </div>
        )}
      </main>

      {edit?.kind === "user" && (
        <Sheet mid title={edit.data.id ? "Edit staff account" : "Create staff account"} onClose={() => setEdit(null)}>
          <div className="ad-grid">
            <Field label="Full name *"><input value={edit.data.name} onChange={set("name")} placeholder="e.g. Rohan Das" /></Field>
            <Field label="Email *"><input value={edit.data.email} onChange={set("email")} placeholder="name@hotel.in" /></Field>
            <Field label="Role *"><select value={edit.data.role} onChange={set("role")}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
          </div>
          <button className="ad-btn" onClick={saveUser}>Save account</button>
        </Sheet>
      )}
      {edit?.kind === "room" && (
        <Sheet mid title={edit.orig ? `Edit room ${edit.orig}` : "Add room"} onClose={() => setEdit(null)}>
          <div className="ad-grid">
            <Field label="Room number *"><input value={edit.data.no} onChange={set("no")} disabled={!!edit.orig} /></Field>
            <Field label="Type"><select value={edit.data.type} onChange={set("type")}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Floor"><input type="number" value={edit.data.floor} onChange={set("floor")} /></Field>
            <Field label="Rate (Rs / night)"><input type="number" value={edit.data.rate} onChange={set("rate")} /></Field>
            <Field label="Amenities"><input value={edit.data.amenities} onChange={set("amenities")} placeholder="AC, WiFi, TV" /></Field>
          </div>
          <button className="ad-btn" onClick={saveRoom}>Save room</button>
        </Sheet>
      )}
      {viewStaff && (
        <Sheet title={`${viewStaff.name} · ${viewStaff.role}`} onClose={() => setViewStaff(null)}>
          <Timeline items={log.filter((l) => l.staff === viewStaff.name)} users={users} />
        </Sheet>
      )}
    </div>
  );
}