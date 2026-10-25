import { useState, useMemo, useEffect, useCallback } from "react";
import "./Admindashboard.css";
import { adminApi } from "../api.js";

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

export default function AdminDashboard({ onLogout, username }) {
  const [page, setPage] = useState("overview");
  const [users, setUsers] = useState(seedUsers);
  const [rooms, setRooms] = useState(seedRooms);
  const [bookings, setBookings] = useState(seedBookings);
  const [log, setLog] = useState(seedLog);
  const [liveStats, setLiveStats] = useState(null);
  const [tax, setTax] = useState({ gst: 12, service: 0, rates: { Single: 2500, Double: 3800, Suite: 6500 } });
  const [edit, setEdit] = useState(null);
  const [viewStaff, setViewStaff] = useState(null);
  const [staffFilter, setStaffFilter] = useState("All");
  const [range, setRange] = useState({ from: "2026-10-01", to: "2026-10-03" });
  const [report, setReport] = useState("Occupancy");
  const [floorTab, setFloorTab] = useState("All");

  // Operational cross-department oversight state
  const [opsData, setOpsData] = useState({
    frontdesk: { recentBookings: [] },
    housekeeping: {
      serviceRequests: [],
      ratings: [
        { id: "R-101", room: 101, type: "Checkout Cleaning", staff: "Anita Joseph", rating: 5, comment: "Room 101 was immaculate. Spotless mirrors and crisp linen. Thank you Anita!", tags: ["Clean & Tidy", "Prompt Response"], time: "10:50" },
        { id: "R-102", room: 102, type: "Extra pillow request", staff: "Anita Joseph", rating: 5, comment: "Very prompt response. Delivered extra pillows within 5 minutes of call.", tags: ["Prompt Response", "Courteous & Polite"], time: "09:45" },
        { id: "R-108", room: 108, type: "Checkout Cleaning", staff: "Anita Joseph", rating: 5, comment: "Turned over checkout room in record time, guest checked in early smoothly.", tags: ["Fast Completion", "Attention to Detail"], time: "Yesterday 15:30" },
      ],
    },
    billing: { recentInvoices: [], recentPayments: [], totalCollected: 35000, collectedToday: 12500 },
  });
  const [opsTab, setOpsTab] = useState("all"); // "all" | "frontdesk" | "housekeeping" | "billing"
  const [recordsFilter, setRecordsFilter] = useState("All");
  const [recordsSearch, setRecordsSearch] = useState("");

  const [adminProfile, setAdminProfile] = useState(() => {
    const defaultName = username
      ? (username.includes("@")
          ? username.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
          : username)
      : "Anita Menon";
    const defaultEmail = username && username.includes("@") ? username : "anita@hotel.in";
    return {
      name: defaultName,
      email: defaultEmail,
      phone: "+91 98470 11000",
      role: "Administrator",
    };
  });
  const me = adminProfile.name;

  const [adminSettings, setAdminSettings] = useState({
    h24: false,
    notifications: true,
    compact: false,
    autoRefresh: true,
  });

  const [profileModal, setProfileModal] = useState(false);
  const [profileTab, setProfileTab] = useState("edit"); // "edit" | "settings"
  const [profileForm, setProfileForm] = useState(adminProfile);
  const [settingsForm, setSettingsForm] = useState(adminSettings);

  const refreshData = useCallback(async () => {
    try {
      const [ovRes, uRes, rRes, bRes, pRes, lRes, opRes] = await Promise.allSettled([
        adminApi.getOverview(),
        adminApi.getUsers(),
        adminApi.getRooms(),
        adminApi.getRecords(),
        adminApi.getPricing(),
        adminApi.getActivity(),
        adminApi.getOperations(),
      ]);

      if (ovRes.status === "fulfilled" && ovRes.value?.success) {
        setLiveStats(ovRes.value.stats);
      }
      if (uRes.status === "fulfilled" && uRes.value?.success) {
        setUsers(uRes.value.users);
      }
      if (rRes.status === "fulfilled" && rRes.value?.success) {
        setRooms(rRes.value.rooms);
      }
      if (bRes.status === "fulfilled" && bRes.value?.success) {
        setBookings(bRes.value.bookings);
      }
      if (pRes.status === "fulfilled" && pRes.value?.success) {
        setTax((prev) => ({
          ...prev,
          gst: pRes.value.tax.gst,
          service: pRes.value.tax.service,
          rates: { ...prev.rates, ...pRes.value.rates },
        }));
      }
      if (lRes.status === "fulfilled" && lRes.value?.success) {
        setLog(lRes.value.log);
      }
      if (opRes.status === "fulfilled" && opRes.value?.success) {
        let combinedRatings = opRes.value.housekeeping?.ratings || [];
        try {
          const localSaved = JSON.parse(localStorage.getItem("veyra_hk_ratings_history") || "null");
          if (Array.isArray(localSaved) && localSaved.length > 0) {
            const seen = new Set();
            combinedRatings = [...localSaved, ...combinedRatings].filter((r) => {
              const k = `${r.room}-${r.time || r.at}-${r.staff || r.title}`;
              if (seen.has(k)) return false;
              seen.add(k);
              return true;
            });
          }
        } catch (e) {}

        setOpsData({
          frontdesk: opRes.value.frontdesk || { recentBookings: [] },
          housekeeping: {
            serviceRequests: opRes.value.housekeeping?.serviceRequests || [],
            ratings: combinedRatings.length > 0 ? combinedRatings : opsData.housekeeping.ratings,
          },
          billing: opRes.value.billing || { recentInvoices: [], recentPayments: [], totalCollected: 0, collectedToday: 0 },
        });
      }
    } catch (err) {
      console.warn("Failed to fetch admin data from backend:", err);
    }
  }, []);

  useEffect(() => {
    refreshData();
    const timer = setInterval(() => refreshData(), 4000);
    const handleSync = () => refreshData();
    window.addEventListener("veyra_service_request_status_updated", handleSync);
    window.addEventListener("veyra_task_completed", handleSync);
    window.addEventListener("veyra_rating_submitted", handleSync);
    window.addEventListener("veyra_maintenance_reported", handleSync);
    return () => {
      clearInterval(timer);
      window.removeEventListener("veyra_service_request_status_updated", handleSync);
      window.removeEventListener("veyra_task_completed", handleSync);
      window.removeEventListener("veyra_rating_submitted", handleSync);
      window.removeEventListener("veyra_maintenance_reported", handleSync);
    };
  }, [refreshData]);

  const openProfile = (tab = "edit") => {
    setProfileForm(adminProfile);
    setSettingsForm(adminSettings);
    setProfileTab(tab);
    setProfileModal(true);
  };

  const saveAdminProfile = (e) => {
    e?.preventDefault();
    if (!profileForm.name.trim()) return;
    setAdminProfile(profileForm);
    record(`Updated administrator profile: ${profileForm.name}`);
    setProfileModal(false);
  };

  const saveAdminSettings = (e) => {
    e?.preventDefault();
    setAdminSettings(settingsForm);
    record("Updated administrator dashboard settings");
    setProfileModal(false);
  };
  const record = (action) =>
    setLog((l) => [{ id: Date.now(), staff: me, action, at: new Date().toISOString().slice(0, 16).replace("T", " ") }, ...l]);

  const stats = useMemo(() => {
    const c = (s) => rooms.filter((r) => r.status === s).length;
    const totalR = rooms.length || 1;
    return {
      occ: liveStats ? liveStats.occupancyRate : (Math.round((c("Occupied") / totalR) * 100) || 0),
      Available: liveStats ? liveStats.available : c("Available"),
      Occupied: liveStats ? liveStats.occupied : c("Occupied"),
      Dirty: liveStats ? liveStats.dirty : c("Dirty"),
      ins: liveStats ? liveStats.checkInsToday : bookings.filter((b) => b.date === new Date().toISOString().slice(0, 10)).length,
      outs: liveStats ? liveStats.checkOutsToday : bookings.filter((b) => b.status === "Checked out").length,
    };
  }, [rooms, liveStats, bookings]);

  const saveUser = async () => {
    const u = edit.data;
    if (!u.name || !u.email) return;
    try {
      if (u.id) {
        await adminApi.updateUser(u.id, u);
      } else {
        await adminApi.createUser(u);
      }
      await refreshData();
    } catch (err) {
      console.error("Save user error:", err);
    }
    setEdit(null);
  };

  const toggleUser = async (u) => {
    try {
      await adminApi.toggleUser(u.id);
      await refreshData();
    } catch (err) {
      console.error("Toggle user error:", err);
    }
  };

  const saveRoom = async () => {
    const r = edit.data;
    if (!r.no) return;
    try {
      if (edit.orig) {
        await adminApi.updateRoom(edit.orig, r);
      } else {
        await adminApi.createRoom(r);
      }
      await refreshData();
    } catch (err) {
      console.error("Save room error:", err);
    }
    setEdit(null);
  };

  const savePricing = async () => {
    try {
      await adminApi.updatePricing({
        rates: tax.rates,
        gst: tax.gst,
        service: tax.service,
      });
      await refreshData();
    } catch (err) {
      console.error("Save pricing error:", err);
    }
  };

  const set = (k) => (e) => setEdit((s) => ({ ...s, data: { ...s.data, [k]: e.target.value } }));

  const logRows = log.filter((l) => staffFilter === "All" || l.staff === staffFilter);
  const inRange = bookings.filter((b) => b.date >= range.from && b.date <= range.to);
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
        <div className="ad-logo"><img src="/logo.png" alt="VEYRA Logo" className="ad-logo-img" /><div><b>VEYRA</b><small>Administrator console</small></div></div>
        <nav aria-label="Main" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          {NAV.map(([id, icon, label]) => (
            <button key={id} className={"ad-nav" + (page === id ? " on" : "")} onClick={() => setPage(id)}>
              <span className="ic" aria-hidden>{icon}</span><span>{label}</span>
              {id === "log" && <span className="ad-pill">{log.length}</span>}
            </button>
          ))}
          <button className="ad-nav ad-nav-logout" onClick={onLogout} style={{ marginTop: "auto", color: "#FF8585" }}>
            <span className="ic" aria-hidden>⎋</span><span>Log out</span>
          </button>
        </nav>
        <div className="ad-me" onClick={() => openProfile("edit")} title="Click to view & edit profile" role="button" tabIndex={0}>
          <span className="ad-av">{initials(me)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ color: "#fff", display: "block", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{me}</b>
            <small style={{ color: "var(--gold-l)" }}>Administrator · Settings ⚙</small>
          </div>
        </div>
      </aside>

      <main className="ad-main">
        <div className="ad-head">
          <div><h1>{cur[2]}</h1><p>{cur[3]}</p></div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="ad-date">{new Date().toDateString()}</span>
            <button className="ad-profile-pill" onClick={() => openProfile("edit")} title="Administrator Profile & Settings">
              <span className="ad-av" style={{ width: 34, height: 34, fontSize: 13, background: "var(--gold)", color: "var(--navy-d)", fontWeight: 700 }}>{initials(me)}</span>
              <span className="ad-profile-pill-name">{me}</span>
              <span className="ad-profile-pill-badge">Profile ⚙</span>
            </button>
          </div>
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
              <h2>Room status mix</h2>
              <div className="ad-split">
                {["Available", "Occupied", "Dirty"].map((s) => <i key={s} style={{ width: `${(stats[s] / total) * 100}%`, background: STATUS_COLOR[s] }} />)}
              </div>
              <div className="ad-legend">{["Available", "Occupied", "Dirty"].map((s) => <span key={s}><em style={{ "--c": STATUS_COLOR[s] }} />{s} ({stats[s]})</span>)}</div>
            </div>

            {/* UNIFIED CROSS-DEPARTMENT OPERATIONS MONITOR */}
            <div className="ad-panel ad-ops-panel">
              <div className="ad-ops-header">
                <div>
                  <h2 style={{ fontSize: 20 }}>Hotel Operations Monitor</h2>
                  <p style={{ margin: "2px 0 0", color: "var(--muted)", fontSize: 13 }}>Real-time cross-department monitoring & ratings</p>
                </div>
                <div className="ad-ops-tabs">
                  {[
                    ["all", "All Operations"],
                    ["frontdesk", "Front Desk Desk"],
                    ["housekeeping", "Housekeeping & Ratings"],
                    ["billing", "Billing & Revenue"],
                  ].map(([k, label]) => (
                    <button
                      key={k}
                      className={`ad-ops-tab ${opsTab === k ? "active" : ""}`}
                      onClick={() => setOpsTab(k)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* FRONT DESK MONITOR */}
              {(opsTab === "all" || opsTab === "frontdesk") && (
                <div className="ad-dept-section">
                  <div className="ad-dept-title-row">
                    <h3 className="ad-dept-title">Front Desk Operations</h3>
                    <span className="ad-dept-sub">Recent bookings, check-in & check-out activities</span>
                  </div>
                  <div className="ad-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Booking</th>
                          <th>Guest Name</th>
                          <th>Phone</th>
                          <th>Room</th>
                          <th>Stay Dates</th>
                          <th>Advance Paid</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(opsData.frontdesk.recentBookings.length > 0 ? opsData.frontdesk.recentBookings : bookings.slice(0, 5)).map((b, idx) => (
                          <tr key={b.booking_id || b.id || idx}>
                            <td><b>{b.booking_code || b.id}</b></td>
                            <td><strong>{b.guest}</strong></td>
                            <td style={{ color: "var(--muted)" }}>{b.phone || "—"}</td>
                            <td><span className="ad-room-pill">Room {b.room}</span></td>
                            <td>{b.check_in || b.date} → {b.check_out || "—"}</td>
                            <td><strong style={{ color: "var(--green)" }}>{money(b.advance_amount || b.amount || 0)}</strong></td>
                            <td>
                              <span className={`ad-tag ${String(b.status).toLowerCase().includes("check") ? "ok" : String(b.status).toLowerCase().includes("reserv") ? "info" : "warn"}`}>
                                {b.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* HOUSEKEEPING & RATINGS MONITOR */}
              {(opsTab === "all" || opsTab === "housekeeping") && (
                <div className="ad-dept-section">
                  {/* Housekeeping Tasks & Service Requests Stream */}
                  <div className="ad-hk-ops-grid">
                    <div className="ad-hk-box">
                      <h4 className="ad-hk-subhead">Live Service Requests & Tasks</h4>
                      <div className="ad-hk-req-list">
                        {(opsData.housekeeping.serviceRequests.length > 0 ? opsData.housekeeping.serviceRequests.slice(0, 5) : [
                          { request_id: "SR-101", room_number: "101", category: "Checkout Cleaning", description: "Turnover room for next guest", status: "completed", staff: "Anita Joseph", created_at: "Today 10:15" },
                          { request_id: "SR-102", room_number: "102", category: "Extra Towels", description: "Deliver 2 bath towels", status: "in_progress", staff: "Anita Joseph", created_at: "Today 09:30" },
                          { request_id: "SR-105", room_number: "105", category: "Quick Turnaround", description: "Early arrival guest prep", status: "assigned", staff: "Anita Joseph", created_at: "Today 08:45" },
                        ]).map((req, i) => (
                          <div key={req.request_id || i} className="ad-hk-item">
                            <div className="ad-hk-item-left">
                              <span className="ad-room-pill sm">Room {req.room_number}</span>
                              <div>
                                <strong>{req.category}</strong>
                                <small style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>{req.description} · By {req.staff || "Anita Joseph"}</small>
                              </div>
                            </div>
                            <span className={`ad-tag ${req.status === "completed" ? "ok" : req.status === "in_progress" ? "info" : "warn"}`}>
                              {req.status === "completed" ? "Done" : req.status === "in_progress" ? "In Progress" : "Accepted"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Housekeeping Ratings Stream Received from Front Desk */}
                    <div className="ad-hk-box">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <h4 className="ad-hk-subhead" style={{ margin: 0 }}>Staff Ratings Received from Front Desk</h4>
                        <span className="ad-rating-kpi">⭐ 5.0 Average</span>
                      </div>
                      <div className="ad-ratings-stream">
                        {opsData.housekeeping.ratings.slice(0, 4).map((r, i) => (
                          <div key={r.id || i} className="ad-rating-card">
                            <div className="ad-rating-card-top">
                              <div>
                                <strong style={{ color: "var(--navy-d)", fontSize: 14 }}>{r.staff || "Anita Joseph"}</strong>
                                <span style={{ marginLeft: 8, fontSize: 12, color: "var(--muted)" }}>Room {r.room} · {r.type || "Service Request"}</span>
                              </div>
                              <div className="ad-stars">
                                {"★".repeat(Number(r.rating) || 5)}
                              </div>
                            </div>
                            {r.comment && (
                              <p className="ad-rating-comment">
                                "{r.comment}"
                              </p>
                            )}
                            <div className="ad-rating-meta">
                              {r.tags && Array.isArray(r.tags) && (
                                <div className="ad-rating-tags">
                                  {r.tags.map((t) => <span key={t} className="ad-tag-chip">{t}</span>)}
                                </div>
                              )}
                              <small style={{ color: "var(--muted)", marginLeft: "auto" }}>{r.time || "Recent"}</small>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* BILLING DESK MONITOR */}
              {(opsTab === "all" || opsTab === "billing") && (
                <div className="ad-dept-section">
                  <div className="ad-dept-title-row">
                    <h3 className="ad-dept-title">Billing Desk Operations</h3>
                    <span className="ad-dept-sub">Invoices generated, payments collected & revenue summary</span>
                  </div>

                  {/* Financial KPI chips */}
                  <div className="ad-billing-kpis">
                    <div className="ad-bkpi-card">
                      <small>Total Revenue Collected</small>
                      <b>{money(opsData.billing.totalCollected || 38200)}</b>
                    </div>
                    <div className="ad-bkpi-card gold">
                      <small>Collected Today</small>
                      <b>{money(opsData.billing.collectedToday || 14200)}</b>
                    </div>
                    <div className="ad-bkpi-card blue">
                      <small>Pending & In-House Folios</small>
                      <b>{money(5600)}</b>
                    </div>
                  </div>

                  <div className="ad-billing-tables-grid">
                    {/* Recent Invoices */}
                    <div className="ad-wrap">
                      <div className="ad-table-caption">Recent Invoices Generated</div>
                      <table>
                        <thead>
                          <tr>
                            <th>Invoice</th>
                            <th>Guest</th>
                            <th>Room</th>
                            <th>Total</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(opsData.billing.recentInvoices.length > 0 ? opsData.billing.recentInvoices.slice(0, 5) : [
                            { invoice_number: "INV-1042", guest: "Arjun Pillai", room: "102", grand_total: 5600, status: "paid" },
                            { invoice_number: "INV-1043", guest: "Sara Thomas", room: "201", grand_total: 4256, status: "paid" },
                            { invoice_number: "INV-1044", guest: "Dev Kumar", room: "301", grand_total: 21840, status: "unsettled" },
                          ]).map((inv, i) => (
                            <tr key={inv.invoice_id || i}>
                              <td><b>{inv.invoice_number}</b></td>
                              <td>{inv.guest}</td>
                              <td><span className="ad-room-pill sm">Room {inv.room}</span></td>
                              <td><strong>{money(inv.grand_total)}</strong></td>
                              <td>
                                <span className={`ad-tag ${inv.status === "paid" ? "ok" : "warn"}`}>
                                  {inv.status === "paid" ? "Settled" : "Pending"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Recent Payments Collected */}
                    <div className="ad-wrap">
                      <div className="ad-table-caption">Payments Collected Stream</div>
                      <table>
                        <thead>
                          <tr>
                            <th>Receipt</th>
                            <th>Guest</th>
                            <th>Amount</th>
                            <th>Method</th>
                            <th>Collected By</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(opsData.billing.recentPayments.length > 0 ? opsData.billing.recentPayments.slice(0, 5) : [
                            { payment_id: "PAY-601", guest: "Arjun Pillai", amount: 5600, method: "upi", collected_by: "Meera Nair", payment_date: "Today 11:20" },
                            { payment_id: "PAY-602", guest: "Sara Thomas", amount: 4256, method: "cash", collected_by: "Meera Nair", payment_date: "Today 10:45" },
                            { payment_id: "PAY-603", guest: "Dev Kumar", amount: 5000, method: "card", collected_by: "Meera Nair", payment_date: "Yesterday 16:30" },
                          ]).map((p, i) => (
                            <tr key={p.payment_id || i}>
                              <td><b>REC-{p.payment_id}</b></td>
                              <td>{p.guest}</td>
                              <td><strong style={{ color: "var(--green)" }}>{money(p.amount)}</strong></td>
                              <td><span className="ad-pay-method">{String(p.method).toUpperCase()}</span></td>
                              <td style={{ color: "var(--muted)", fontSize: 13 }}>{p.collected_by}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="ad-panel"><h2 style={{ marginBottom: 18 }}>Recent hotel audit activity</h2><FeedCards items={log.slice(0, 4)} users={users} /></div>
          </>
        )}

        {page === "users" && (
          <div className="ad-users-container">
            <div className="ad-section-bar">
              <div className="ad-stats-summary">
                <div className="ad-stat-pill">
                  <span className="dot ok" />
                  <span><strong>{users.filter((u) => u.active).length}</strong> Active Staff</span>
                </div>
                <div className="ad-stat-pill">
                  <span className="dot off" />
                  <span><strong>{users.filter((u) => !u.active).length}</strong> Inactive</span>
                </div>
                <div className="ad-stat-pill total">
                  <span>Total Staff: <strong>{users.length}</strong></span>
                </div>
              </div>
              <button
                className="ad-btn"
                onClick={() => setEdit({ kind: "user", data: { name: "", email: "", role: ROLES[1] } })}
              >
                + Create staff account
              </button>
            </div>

            <div className="ad-users-grid">
              {users.map((u) => (
                <article key={u.id} className={"ad-user-card" + (u.active ? "" : " inactive")}>
                  <div className="ad-user-card-top">
                    <span className="ad-role-pill">{u.role}</span>
                    <span className={"ad-status-pill " + (u.active ? "active" : "inactive")}>
                      <span className="dot" />
                      {u.active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="ad-user-card-body">
                    <div className="ad-user-avatar" style={{ background: colorOf(users, u.name) }}>
                      {initials(u.name)}
                    </div>
                    <div className="ad-user-details">
                      <h3>{u.name}</h3>
                      <p className="ad-user-email">
                        <span className="email-icon">✉</span> {u.email}
                      </p>
                    </div>
                  </div>

                  <div className="ad-user-card-footer">
                    <button
                      className="ad-action-btn edit"
                      onClick={() => setEdit({ kind: "user", data: { ...u } })}
                    >
                      Edit
                    </button>
                    <button
                      className="ad-action-btn view"
                      onClick={() => setViewStaff(u)}
                    >
                      Activity
                    </button>
                    <button
                      className={"ad-action-btn " + (u.active ? "deactivate" : "activate")}
                      onClick={() => toggleUser(u)}
                    >
                      {u.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {page === "rooms" && (
          <div className="ad-rooms-container">
            <div className="ad-rooms-header-card">
              <div className="ad-rooms-metrics">
                {["Available", "Occupied", "Dirty"].map((s) => (
                  <div key={s} className="ad-metric-item" style={{ "--m-color": STATUS_COLOR[s] }}>
                    <div className="ad-metric-num">{stats[s]}</div>
                    <div className="ad-metric-label">
                      <span className="m-dot" />
                      {s}
                    </div>
                  </div>
                ))}
                <div className="ad-metric-item" style={{ "--m-color": "var(--navy)" }}>
                  <div className="ad-metric-num">{rooms.length}</div>
                  <div className="ad-metric-label">
                    <span className="m-dot" />
                    Total Rooms
                  </div>
                </div>
              </div>
              <button
                className="ad-btn"
                onClick={() => setEdit({ kind: "room", orig: null, data: { no: "", type: "Single", floor: 1, rate: tax.rates.Single, amenities: "" } })}
              >
                + Add room
              </button>
            </div>

            <div className="ad-floor-filter-bar">
              <span className="filter-label">Floor View:</span>
              <div className="ad-chips">
                {["All", ...[...new Set(rooms.map((r) => r.floor))].sort()].map((f) => (
                  <button
                    key={f}
                    className={String(floorTab) === String(f) ? "on" : ""}
                    onClick={() => setFloorTab(f)}
                  >
                    {f === "All" ? "All floors" : `Floor ${f}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="ad-suites-grid">
              {rooms.filter((r) => floorTab === "All" || r.floor === floorTab).map((r) => (
                <article key={r.no} className="ad-suite-card" style={{ "--room-color": STATUS_COLOR[r.status] }}>
                  <div className="ad-suite-status-bar" />
                  <div className="ad-suite-card-inner">
                    <div className="ad-suite-top">
                      <div className="ad-suite-number-wrap">
                        <span className="ad-suite-num">Room {r.no}</span>
                        <span className="ad-suite-floor">Floor {r.floor}</span>
                      </div>
                      <span className="ad-suite-badge">
                        <i className="badge-dot" />
                        {r.status}
                      </span>
                    </div>

                    <div className="ad-suite-type-heading">
                      <h3>{r.type} room</h3>
                      <div className="ad-suite-price">
                        <strong>{money(r.rate)}</strong>
                        <small>/ night</small>
                      </div>
                    </div>

                    <div className="ad-suite-amenities">
                      {r.amenities
                        ? r.amenities.split(",").map((a, i) => (
                            <span key={i} className="ad-amenity-pill">
                              {a.trim()}
                            </span>
                          ))
                        : <span className="ad-amenity-pill none">Standard amenities</span>}
                    </div>

                    <div className="ad-suite-actions">
                      <button
                        className="ad-btn ghost sm ad-suite-edit-btn"
                        onClick={() => setEdit({ kind: "room", orig: r.no, data: { ...r } })}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {page === "records" && (() => {
          const filtered = bookings.filter((b) => {
            const matchesStatus = recordsFilter === "All" || b.status.toLowerCase().includes(recordsFilter.toLowerCase());
            const matchesSearch = !recordsSearch.trim() ||
              `${b.guest} ${b.room} ${b.id} ${b.date}`.toLowerCase().includes(recordsSearch.toLowerCase());
            return matchesStatus && matchesSearch;
          });
          const totalBilled = filtered.reduce((s, b) => s + (Number(b.amount) || 0), 0);
          const checkedInCount = bookings.filter((b) => b.status.toLowerCase().includes("check")).length;

          return (
            <div className="ad-records-container">
              {/* Executive Summary Banner */}
              <div className="ad-records-metrics">
                <div className="ad-rec-metric">
                  <small>Total Guest Bookings</small>
                  <b>{bookings.length}</b>
                </div>
                <div className="ad-rec-metric gold">
                  <small>Active In-House Stays</small>
                  <b>{checkedInCount}</b>
                </div>
                <div className="ad-rec-metric green">
                  <small>Total Value Billed</small>
                  <b>{money(totalBilled)}</b>
                </div>
              </div>

              {/* Toolbar: Search & Status Filters */}
              <div className="ad-section-bar">
                <div className="ad-records-filters">
                  {["All", "Checked in", "Reserved", "Checked out"].map((f) => (
                    <button
                      key={f}
                      className={`ad-filter-chip ${recordsFilter === f ? "on" : ""}`}
                      onClick={() => setRecordsFilter(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="ad-records-search">
                  <input
                    type="search"
                    placeholder="Search guest, room, booking ID..."
                    value={recordsSearch}
                    onChange={(e) => setRecordsSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Executive Records Ledger Table */}
              <div className="ad-panel" style={{ padding: 0, overflow: "hidden" }}>
                <div className="ad-wrap" style={{ border: "none" }}>
                  <table>
                    <thead>
                      <tr>
                        {["Booking Ref", "Guest Name", "Room", "Stay Date", "Nights", "Bill (incl. GST)", "Status"].map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: "center", padding: "30px 0", color: "var(--muted)" }}>
                            No guest records match your search criteria.
                          </td>
                        </tr>
                      ) : (
                        filtered.map((b) => (
                          <tr key={b.id}>
                            <td><b style={{ color: "var(--navy-d)" }}>{b.id}</b></td>
                            <td><strong>{b.guest}</strong></td>
                            <td><span className="ad-room-pill sm">Room {b.room}</span></td>
                            <td>{b.date}</td>
                            <td>{b.nights} night{b.nights > 1 ? "s" : ""}</td>
                            <td><strong style={{ color: "var(--navy-d)" }}>{money(b.amount)}</strong></td>
                            <td>
                              <span className={`ad-tag ${b.status.toLowerCase().includes("check") ? "ok" : b.status.toLowerCase().includes("reserv") ? "info" : "warn"}`}>
                                {b.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={5} style={{ fontWeight: 700 }}>Total Billed ({filtered.length} bookings)</td>
                        <td colSpan={2} style={{ fontWeight: 700, color: "var(--navy-d)", fontSize: 16 }}>
                          {money(totalBilled)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

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
                <button className="ad-btn" onClick={savePricing}>Save pricing</button>
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
      {profileModal && (
        <Sheet mid title="Administrator Profile & Settings" onClose={() => setProfileModal(false)}>
          <div className="ad-modal-tabs">
            <button
              type="button"
              className={"ad-modal-tab" + (profileTab === "edit" ? " on" : "")}
              onClick={() => setProfileTab("edit")}
            >
              👤 Edit Profile
            </button>
            <button
              type="button"
              className={"ad-modal-tab" + (profileTab === "settings" ? " on" : "")}
              onClick={() => setProfileTab("settings")}
            >
              ⚙ Settings
            </button>
          </div>

          {profileTab === "edit" && (
            <form onSubmit={saveAdminProfile} className="ad-profile-form">
              <div className="ad-modal-avatar-preview">
                <span className="ad-av" style={{ width: 64, height: 64, fontSize: 24, background: "var(--gold)", color: "var(--navy-d)", margin: "0 auto 10px" }}>
                  {initials(profileForm.name || me)}
                </span>
                <b style={{ display: "block", color: "var(--navy-d)", fontSize: 16 }}>{profileForm.name || me}</b>
                <small style={{ color: "var(--muted)" }}>System Administrator</small>
              </div>

              <div className="ad-grid" style={{ marginTop: 16 }}>
                <Field label="Full Name *">
                  <input
                    type="text"
                    required
                    value={profileForm.name}
                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                    placeholder="e.g. Anita Menon"
                  />
                </Field>
                <Field label="Email Address *">
                  <input
                    type="email"
                    required
                    value={profileForm.email}
                    onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                    placeholder="admin@hotel.in"
                  />
                </Field>
                <Field label="Phone Number">
                  <input
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    placeholder="+91 98470 11000"
                  />
                </Field>
                <Field label="Assigned Role">
                  <input
                    type="text"
                    value={profileForm.role}
                    disabled
                    style={{ background: "var(--paper)", cursor: "not-allowed", color: "var(--muted)" }}
                  />
                </Field>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                <button type="submit" className="ad-btn" style={{ flex: 1 }}>Save Changes</button>
                <button type="button" className="ad-btn ghost" onClick={() => setProfileModal(false)}>Cancel</button>
              </div>
            </form>
          )}

          {profileTab === "settings" && (
            <form onSubmit={saveAdminSettings} className="ad-settings-form">
              <div className="ad-settings-list">
                <label className="ad-setting-item">
                  <div className="ad-setting-info">
                    <strong>24-Hour Time Format</strong>
                    <small>Show timestamps and activity logs in 24-hour military notation (e.g. 18:30)</small>
                  </div>
                  <input
                    type="checkbox"
                    checked={settingsForm.h24}
                    onChange={(e) => setSettingsForm({ ...settingsForm, h24: e.target.checked })}
                    className="ad-checkbox"
                  />
                </label>

                <label className="ad-setting-item">
                  <div className="ad-setting-info">
                    <strong>System & Email Notifications</strong>
                    <small>Receive instant popups on room updates, billings, and staff logins</small>
                  </div>
                  <input
                    type="checkbox"
                    checked={settingsForm.notifications}
                    onChange={(e) => setSettingsForm({ ...settingsForm, notifications: e.target.checked })}
                    className="ad-checkbox"
                  />
                </label>

                <label className="ad-setting-item">
                  <div className="ad-setting-info">
                    <strong>Compact Dashboard Density</strong>
                    <small>Condense spacing and card dimensions for higher-density displays</small>
                  </div>
                  <input
                    type="checkbox"
                    checked={settingsForm.compact}
                    onChange={(e) => setSettingsForm({ ...settingsForm, compact: e.target.checked })}
                    className="ad-checkbox"
                  />
                </label>

                <label className="ad-setting-item">
                  <div className="ad-setting-info">
                    <strong>Real-time Auto Refresh</strong>
                    <small>Periodically sync guest bookings and room occupancy in background</small>
                  </div>
                  <input
                    type="checkbox"
                    checked={settingsForm.autoRefresh}
                    onChange={(e) => setSettingsForm({ ...settingsForm, autoRefresh: e.target.checked })}
                    className="ad-checkbox"
                  />
                </label>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                <button type="submit" className="ad-btn" style={{ flex: 1 }}>Save Settings</button>
                <button type="button" className="ad-btn ghost" onClick={() => setProfileModal(false)}>Cancel</button>
              </div>
            </form>
          )}
        </Sheet>
      )}
    </div>
  );
}