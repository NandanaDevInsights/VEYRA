import React, { useState, useMemo, useRef, useEffect } from "react";
import "./frontdashboard.css"; // unchanged - new bits use the small EXTRA_CSS block below

/* =========================================================
   CONSTANTS
   ========================================================= */
const STATUS_META = {
  available: { label: "Available", key: "available" },
  occupied: { label: "Occupied", key: "occupied" },
  reserved: { label: "Reserved", key: "reserved" },
  cleaning: { label: "Under cleaning", key: "cleaning" },
  outOfService: { label: "Out of service", key: "outOfService" },
};
const LEGEND_COLORS = {
  available: "var(--green)",
  occupied: "var(--red)",
  reserved: "var(--amber)",
  cleaning: "var(--blue)",
  outOfService: "var(--grey)",
};

const CHECKIN_HOUR = 12;
const CHECKOUT_HOUR = 11;
const NOSHOW_HOUR = 18;
const RATES = { Single: 2500, Double: 3800, Deluxe: 5200, Suite: 9000 };
const CAP = { Single: 2, Double: 3, Deluxe: 3, Suite: 5 }; // max guests per room type
const MEALS = { "No meals": 0, Breakfast: 400, "Half board": 900 }; // per guest per night
const PAY_MODES = ["Cash", "UPI", "Card", "Bank transfer"];
const CHARGE_CATS = ["Restaurant", "Room service", "Minibar", "Laundry", "Spa", "Taxi", "Other"];
const MOVE_REASONS = ["Guest request", "Maintenance issue", "Upgrade", "Noise complaint"];
const GST = 1.12;
const USER = "Ananya Menon";
const ACTIVE = ["Pending", "Confirmed", "Checked-In"];

const NAV_ITEMS = [
  { key: "overview", label: "Overview", icon: "grid" },
  { key: "booking", label: "New Booking", icon: "plus" },
  { key: "rooms", label: "Room Board", icon: "key" },
  { key: "arrivals", label: "Arrivals & Departures", icon: "arrows" },
  { key: "inhouse", label: "In-House Guests", icon: "users" },
  { key: "requests", label: "Service Requests", icon: "list" },
  { key: "notifications", label: "Notifications", icon: "bell" },
  { key: "records", label: "Guest Records", icon: "search" },
  { key: "reports", label: "Shift Report", icon: "chart" },
];

/* Small extra stylesheet: fixes left alignment seen in the screenshots + styles for new widgets.
   Your frontdashboard.css is NOT modified. */
const EXTRA_CSS = `
.fd-app{text-align:left}
.fd-app .fd-label{display:block;text-align:left}
.fd-app .fd-table th,.fd-app .fd-table td{text-align:left;vertical-align:middle}
.fd-app .fd-section-header{text-align:left}
.fd-app .fd-error{text-align:left}
.fd-body-layout{align-items:stretch}
.fd-sidebar{min-height:calc(100vh - 100px)}
.fx-bar{height:8px;border-radius:6px;background:rgba(0,0,0,.09);overflow:hidden}
.fx-bar>span{display:block;height:100%;border-radius:6px;transition:width .3s}
.fx-booking-grid{display:grid;grid-template-columns:minmax(0,2.2fr) minmax(280px,1fr);gap:18px;align-items:start}
.fx-summary{position:sticky;top:12px}
.fx-sum-row{display:flex;justify-content:space-between;gap:10px;padding:6px 0;font-size:13px;border-bottom:1px dashed rgba(0,0,0,.12)}
.fx-sum-row.total{font-weight:700;font-size:15px;border-bottom:none}
.fx-pal-item{display:block;width:100%;text-align:left;padding:9px 12px;border:none;background:transparent;border-radius:8px;cursor:pointer;font-size:14px;color:inherit}
.fx-pal-item.active{background:var(--navy);color:#fff}
.fx-tool{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.fx-donut-wrap{display:flex;gap:20px;align-items:center;flex-wrap:wrap}
.fx-donut-legend div{display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:5px}
.fx-dot{width:10px;height:10px;border-radius:50%;display:inline-block}
@media (max-width:1100px){.fx-booking-grid{grid-template-columns:1fr}.fx-summary{position:static}}
@media print{.fd-header,.fd-sidebar,.fd-toast,.no-print{display:none!important}.fd-body-layout{display:block}}
`;

/* =========================================================
   DATE + MISC HELPERS
   ========================================================= */
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toISO(d);
}
const fmtDate = (offset) => addDays(toISO(new Date()), offset);
function displayDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
const nightsBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);
const estimate = (roomType, nights) => Math.round((RATES[roomType] || 0) * Math.max(nights, 0) * GST);
const money = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN");
const uid = () => Date.now() + Math.random();
const TODAY = fmtDate(0);
const maskId = (id) => (id && id.length > 4 && !id.includes("X") ? "XXXX-" + id.slice(-4) : id);
function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : displayDate(toISO(new Date(ts)));
}
const shiftOf = (h) => (h >= 6 && h < 14 ? "Morning" : h >= 14 && h < 22 ? "Evening" : "Night");

/* Folio maths: base total + extra charges, minus payments */
const chargesSum = (b) => (b.charges || []).reduce((s, c) => s + c.amount, 0);
const grandOf = (b) => b.total + chargesSum(b);
const dueOf = (b) => Math.max(grandOf(b) - b.paid, 0);

function roomFree(bookings, room, ci, co, excludeId) {
  return !bookings.some((b) => b.id !== excludeId && b.room === room && ACTIVE.includes(b.status) && ci < b.checkOut && co > b.checkIn);
}
const roomLabel = (r) => (r.status === "cleaning" ? (r.hk === "dirty" ? "Dirty" : "Under cleaning") : STATUS_META[r.status].label);

/* Saves state to localStorage (keyed by day because the demo seed data is relative to today) */
const DAY_KEY = "rch:" + TODAY + ":";
function usePersist(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(DAY_KEY + key);
      return s ? JSON.parse(s) : initial;
    } catch (e) {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(DAY_KEY + key, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ }
  }, [key, v]);
  return [v, setV];
}

/* =========================================================
   SEED DATA
   ========================================================= */
const INITIAL_ROOMS = [
  { number: "101", floor: 1, type: "Single", status: "cleaning", hk: "dirty" },
  { number: "102", floor: 1, type: "Single", status: "reserved" },
  { number: "103", floor: 1, type: "Single", status: "cleaning", hk: "cleaning" },
  { number: "104", floor: 1, type: "Single", status: "available" },
  { number: "105", floor: 1, type: "Single", status: "reserved" },
  { number: "106", floor: 1, type: "Single", status: "occupied" },
  { number: "201", floor: 2, type: "Double", status: "available" },
  { number: "202", floor: 2, type: "Double", status: "occupied" },
  { number: "203", floor: 2, type: "Double", status: "available" },
  { number: "204", floor: 2, type: "Double", status: "outOfService", note: "AC fault - maintenance informed" },
  { number: "205", floor: 2, type: "Double", status: "occupied" },
  { number: "206", floor: 2, type: "Double", status: "cleaning", hk: "cleaning" },
  { number: "301", floor: 3, type: "Deluxe", status: "available" },
  { number: "302", floor: 3, type: "Deluxe", status: "occupied" },
  { number: "303", floor: 3, type: "Deluxe", status: "available" },
  { number: "304", floor: 3, type: "Deluxe", status: "cleaning", hk: "dirty" },
  { number: "401", floor: 4, type: "Suite", status: "available" },
  { number: "402", floor: 4, type: "Suite", status: "available" },
];

function mk(o) {
  const total = estimate(o.roomType, nightsBetween(o.checkIn, o.checkOut));
  return { email: "", source: "Walk-in", eta: "", requests: "", lateCheckout: false, meal: "No meals", mealPerNight: 0, charges: [], payments: [], total, paid: 0, ...o };
}
const INITIAL_BOOKINGS = [
  mk({ id: "BK1001", name: "Aarav Mehta", phone: "9845012233", idType: "Aadhaar", idNumber: "XXXX-1122", purpose: "Business", roomType: "Single", guests: 1, checkIn: TODAY, checkOut: fmtDate(3), status: "Confirmed", room: "102", eta: "14:00", source: "Phone", paid: 2000 }),
  mk({ id: "BK1002", name: "Priya Nair", phone: "9900123456", idType: "Passport", idNumber: "N88213X", purpose: "Leisure", roomType: "Double", guests: 2, checkIn: fmtDate(-2), checkOut: TODAY, status: "Checked-In", room: "202", source: "Online", paid: 7600 }),
  mk({ id: "BK1003", name: "Rohan Das", phone: "9812345670", idType: "Aadhaar", idNumber: "XXXX-7788", purpose: "Leisure", roomType: "Deluxe", guests: 2, checkIn: TODAY, checkOut: fmtDate(2), status: "Pending", room: null, eta: "16:30", source: "Online" }),
  mk({ id: "BK1004", name: "Sanjana Rao", phone: "9871234509", idType: "Driving Licence", idNumber: "KA05-9981", purpose: "Business", roomType: "Deluxe", guests: 1, checkIn: fmtDate(-1), checkOut: fmtDate(2), status: "Checked-In", room: "302", source: "Agent", paid: 5000 }),
  mk({ id: "BK1005", name: "Vikram Singh", phone: "9765432198", idType: "Aadhaar", idNumber: "XXXX-4433", purpose: "Business", roomType: "Single", guests: 1, checkIn: fmtDate(-5), checkOut: fmtDate(-1), status: "Checked-Out", room: "101", paid: 11200 }),
  mk({ id: "BK1006", name: "Meera Iyer", phone: "9823456701", idType: "Passport", idNumber: "P77102Y", purpose: "Leisure", roomType: "Suite", guests: 3, checkIn: fmtDate(2), checkOut: fmtDate(4), status: "Confirmed", room: "402", source: "Online", paid: 5000 }),
  mk({ id: "BK1007", name: "Karthik Menon", phone: "9856701234", idType: "Aadhaar", idNumber: "XXXX-5566", purpose: "Leisure", roomType: "Single", guests: 1, checkIn: TODAY, checkOut: fmtDate(1), status: "Confirmed", room: "105", eta: "13:00", paid: 0 }),
  mk({ id: "BK1008", name: "Divya Krishnan", phone: "9834567123", idType: "Aadhaar", idNumber: "XXXX-9911", purpose: "Business", roomType: "Double", guests: 1, checkIn: fmtDate(-3), checkOut: TODAY, status: "Checked-In", room: "205", paid: 4000 }),
  mk({ id: "BK1009", name: "Nikhil Joseph", phone: "9745098123", idType: "Voter ID", idNumber: "KL/04/118", purpose: "Event", roomType: "Single", guests: 1, checkIn: fmtDate(-1), checkOut: fmtDate(1), status: "Checked-In", room: "106", source: "Phone", paid: 5600 }),
];

const mins = (m) => Date.now() - m * 60000;
const INITIAL_NOTIFICATIONS = [
  { id: 1, text: "Room 204 reported AC fault - blocked for maintenance.", priority: "Warning", type: "rooms", link: "rooms", ts: mins(8), read: false },
  { id: 2, text: "Guest in Room 302 requested a late checkout.", priority: "Info", type: "requests", link: "requests", ts: mins(24), read: false },
  { id: 3, text: "New booking pending for 2 nights - Rohan Das.", priority: "Info", type: "booking", link: "overview", ts: mins(60), read: false },
];
const INITIAL_REQUESTS = [
  { id: 1, room: "202", type: "Extra towels", desc: "Two bath towels", priority: "Normal", status: "New", ts: mins(12) },
  { id: 2, room: "302", type: "Late check-out", desc: "Guest wants 2 PM check-out", priority: "High", status: "Assigned", ts: mins(24) },
  { id: 3, room: "106", type: "Wake-up call", desc: "6:00 AM tomorrow", priority: "Normal", status: "In progress", ts: mins(90) },
];
const INITIAL_NOTES = [
  { id: 1, text: "VIP guest expected tonight - keep a welcome drink ready.", room: "402", author: "Night desk", shift: "Night", ts: mins(300) },
];
const INITIAL_AUDIT = [
  { id: 1, ts: mins(180), user: "Ananya Menon", kind: "checkin", text: "Checked in Nikhil Joseph to Room 106", ref: "BK1009", amount: 5600 },
  { id: 2, ts: mins(150), user: "Ananya Menon", kind: "room", text: "Room 103 set to Under cleaning", ref: "103", amount: 0 },
];

const REQUEST_STEPS = ["New", "Assigned", "In progress", "Done"];
const PRIORITY_COLOR = { Urgent: "var(--red)", Warning: "var(--amber)", Info: "var(--blue)", High: "var(--red)", Normal: "var(--blue)", Low: "var(--grey)" };

const S = {
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 18, marginTop: 18 },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, marginBottom: 16 },
  chip: (c) => ({ display: "inline-block", padding: "2px 9px", borderRadius: 10, fontSize: 11, fontWeight: 600, color: "#fff", background: c, whiteSpace: "nowrap" }),
  muted: { fontSize: 12, color: "var(--charcoal-soft)" },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  rowBetween: { display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" },
  fieldGap: { marginBottom: 12 },
};

/* =========================================================
   SMALL COMPONENTS
   ========================================================= */
function Icon({ name, size = 18, color = "currentColor" }) {
  const paths = {
    bell: "M12 3a5 5 0 0 0-5 5v2.3c0 .5-.2 1-.5 1.4L5 14.5c-.6.8 0 2 1 2h12c1 0 1.6-1.2 1-2l-1.5-2.8c-.3-.4-.5-.9-.5-1.4V8a5 5 0 0 0-5-5Z M9.5 19a2.5 2.5 0 0 0 5 0",
    logout: "M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3 M16 15l4-4-4-4 M20 11H9",
    search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z M21 21l-4.3-4.3",
    check: "M20 6 9 17l-5-5",
    close: "M18 6 6 18 M6 6l12 12",
    print: "M6 9V3h12v6 M6 18H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2 M6 14h12v7H6z",
    download: "M12 3v12 M7 10l5 5 5-5 M5 21h14",
    user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7",
    key: "M14 7a4 4 0 1 1-3.9 5H2v2H4v2H7v-2h1.5l.6-1H10a4 4 0 0 0 4-4 4 4 0 0 0 0-2Z",
    plus: "M12 5v14 M5 12h14",
    grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
    arrows: "M7 7 3 11l4 4 M3 11h13 M17 17l4-4-4-4 M21 13H8",
    users: "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M2 20c0-3 2.7-5 6-5s6 2 6 5 M14 15c3 0 6 1.5 6 5",
    list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
    chart: "M4 20V10 M10 20V4 M16 20v-8 M22 20H2",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name] || ""} />
    </svg>
  );
}

function Toast({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="fd-toast">
      <span>{message}</span>
      <button className="fd-toast-close" onClick={onClose}>
        <Icon name="close" size={14} color="var(--gold-light)" />
      </button>
    </div>
  );
}

function StatCard({ label, value, accentVar, sub, onClick }) {
  return (
    <div className="fd-stat-card" onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }} title={onClick ? "Click to open" : undefined}>
      <div className="fd-stat-accent-bar" style={{ background: accentVar }} />
      <span className="fd-stat-label">{label}</span>
      <span className="fd-stat-value">{value}</span>
      {sub && <span style={{ ...S.muted, textAlign: "center" }}>{sub}</span>}
    </div>
  );
}

function SectionHeader({ eyebrow, title, action }) {
  return (
    <div className="fd-section-header">
      <div>
        <div className="fd-eyebrow">{eyebrow}</div>
        <h2 className="fd-section-title">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function Modal({ children, onClose, width = 480 }) {
  return (
    <div className="fd-modal-overlay" onClick={onClose}>
      <div className="fd-modal" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function ModalTitle({ title, sub, onClose }) {
  return (
    <>
      <div className="fd-modal-title-row">
        <h3 className="fd-modal-title">{title}</h3>
        <button className="fd-modal-close-btn" onClick={onClose}>
          <Icon name="close" size={18} color="var(--charcoal-soft)" />
        </button>
      </div>
      {sub && <div className="fd-modal-sub">{sub}</div>}
    </>
  );
}

/* Donut chart for the room-status mix (SVG, no library) */
function Donut({ data, total, centerValue, centerLabel }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width="150" height="150" viewBox="0 0 140 140" role="img" aria-label="Room status mix">
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="16" />
      {data.filter((d) => d.value > 0).map((d) => {
        const len = (d.value / Math.max(total, 1)) * c;
        const el = (
          <circle key={d.label} cx="70" cy="70" r={r} fill="none" strokeWidth="16" transform="rotate(-90 70 70)"
            style={{ stroke: d.color }} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />
        );
        offset += len;
        return el;
      })}
      <text x="70" y="68" textAnchor="middle" fontSize="24" fontWeight="700" fill="currentColor">{centerValue}</text>
      <text x="70" y="86" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.7">{centerLabel}</text>
    </svg>
  );
}

/* Check-in: verify ID, confirm room (only Vacant + Clean rooms), take advance */
function CheckInModal({ booking, rooms, candidates, onClose, onConfirm }) {
  const assigned = rooms.find((r) => r.number === booking.room);
  const assignedReady = assigned && (assigned.status === "available" || assigned.status === "reserved");
  const [room, setRoom] = useState(assignedReady ? booking.room : "");
  const [idOk, setIdOk] = useState(false);
  const [advance, setAdvance] = useState("0");
  const options = [...(assignedReady ? [assigned] : []), ...candidates.filter((c) => c.number !== booking.room)];
  return (
    <Modal onClose={onClose} width={500}>
      <div className="fd-modal-inner">
        <ModalTitle title={`Check in ${booking.name}`} sub={`${booking.id} - ${booking.roomType} room - ${booking.guests} guest(s)`} onClose={onClose} />
        {booking.room && !assignedReady && (
          <div className="fd-suggested-note">Room {booking.room} is not ready yet ({assigned ? roomLabel(assigned) : "unknown"}). Pick another room below or wait for housekeeping.</div>
        )}
        <div style={S.fieldGap}>
          <label className="fd-label">Room (vacant and clean only)</label>
          <select className="fd-select" value={room} onChange={(e) => setRoom(e.target.value)}>
            <option value="">Select a room</option>
            {options.map((r) => (
              <option key={r.number} value={r.number}>Room {r.number} - {r.type} - Floor {r.floor}</option>
            ))}
          </select>
        </div>
        <div style={S.fieldGap}>
          <label className="fd-label">Advance / deposit collected (Rs)</label>
          <input className="fd-input" type="number" min="0" value={advance} onChange={(e) => setAdvance(e.target.value)} />
        </div>
        <div style={{ ...S.muted, marginBottom: 10 }}>
          ID on file: {booking.idType} {maskId(booking.idNumber)}. Total {money(grandOf(booking))}, already paid {money(booking.paid)}.
          {booking.requests ? ` Special request: ${booking.requests}.` : ""}
        </div>
        <label style={{ ...S.row, marginBottom: 14, fontSize: 13 }}>
          <input type="checkbox" checked={idOk} onChange={(e) => setIdOk(e.target.checked)} /> I have verified the guest's original ID against the booking
        </label>
        <button className="fd-submit-btn" disabled={!room || !idOk} style={{ opacity: !room || !idOk ? 0.5 : 1 }} onClick={() => onConfirm(booking, room, Number(advance) || 0)}>
          <Icon name="check" size={16} color="#fff" /> Confirm check-in and print pass
        </button>
      </div>
    </Modal>
  );
}

/* Check-out: charges summary, key return, room inspection, payment mode */
function CheckOutModal({ booking, onClose, onConfirm }) {
  const balance = dueOf(booking);
  const [key, setKey] = useState(false);
  const [inspect, setInspect] = useState(false);
  const [settled, setSettled] = useState(false);
  const [mode, setMode] = useState(PAY_MODES[0]);
  const ready = key && inspect && (balance === 0 || settled);
  return (
    <Modal onClose={onClose} width={480}>
      <div className="fd-modal-inner">
        <ModalTitle title={`Check out ${booking.name}`} sub={`Room ${booking.room} - ${displayDate(booking.checkIn)} to ${displayDate(booking.checkOut)}`} onClose={onClose} />
        <table className="fd-table" style={{ marginBottom: 12 }}>
          <tbody>
            <tr><td>Stay charges (incl. GST)</td><td>{money(booking.total)}</td></tr>
            <tr><td>Extra charges ({(booking.charges || []).length})</td><td>{money(chargesSum(booking))}</td></tr>
            <tr><td>Paid so far</td><td>{money(booking.paid)}</td></tr>
            <tr><td><b>Balance due</b></td><td><b style={{ color: balance ? "var(--red)" : "var(--green)" }}>{money(balance)}</b></td></tr>
          </tbody>
        </table>
        <label style={{ ...S.row, marginBottom: 8, fontSize: 13 }}><input type="checkbox" checked={key} onChange={(e) => setKey(e.target.checked)} /> Key card returned</label>
        <label style={{ ...S.row, marginBottom: 8, fontSize: 13 }}><input type="checkbox" checked={inspect} onChange={(e) => setInspect(e.target.checked)} /> Minibar and room damage checked</label>
        {balance > 0 && (
          <>
            <div style={{ ...S.row, marginBottom: 10 }}>
              <span style={{ fontSize: 13 }}>Payment mode</span>
              <select className="fd-select" style={{ width: 160 }} value={mode} onChange={(e) => setMode(e.target.value)}>
                {PAY_MODES.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <label style={{ ...S.row, marginBottom: 12, fontSize: 13 }}>
              <input type="checkbox" checked={settled} onChange={(e) => setSettled(e.target.checked)} /> I received {money(balance)} from the guest
            </label>
          </>
        )}
        <button className="fd-submit-btn" disabled={!ready} style={{ opacity: ready ? 1 : 0.5 }} onClick={() => onConfirm(booking, settled, mode)}>
          <Icon name="check" size={16} color="#fff" /> Complete check-out
        </button>
      </div>
    </Modal>
  );
}

/* Guest folio: post charges, take payments, download invoice */
function FolioModal({ booking, onClose, onCharge, onPay, onInvoice, canCharge, canPay }) {
  const [ch, setCh] = useState({ cat: CHARGE_CATS[0], desc: "", amount: "" });
  const [pay, setPay] = useState({ mode: PAY_MODES[0], amount: "" });
  const due = dueOf(booking);
  const chAmt = Number(ch.amount) || 0;
  const payAmt = Number(pay.amount) || 0;
  const closed = booking.status === "Checked-Out";
  return (
    <Modal onClose={onClose} width={580}>
      <div className="fd-modal-inner">
        <ModalTitle title={`Folio - ${booking.name}`} sub={`${booking.id} - Room ${booking.room || "unassigned"} - ${displayDate(booking.checkIn)} to ${displayDate(booking.checkOut)}`} onClose={onClose} />
        <table className="fd-table" style={{ marginBottom: 12 }}>
          <tbody>
            <tr><td>Room and meals (incl. GST)</td><td>{money(booking.total)}</td></tr>
            {(booking.charges || []).map((c) => (
              <tr key={c.id}><td>{c.cat}{c.desc ? ` - ${c.desc}` : ""} <span style={S.muted}>{ago(c.ts)}</span></td><td>{money(c.amount)}</td></tr>
            ))}
            <tr><td><b>Grand total</b></td><td><b>{money(grandOf(booking))}</b></td></tr>
            <tr><td>Paid</td><td>{money(booking.paid)}</td></tr>
            <tr><td><b>Balance due</b></td><td><b style={{ color: due ? "var(--red)" : "var(--green)" }}>{money(due)}</b></td></tr>
          </tbody>
        </table>

        {(booking.payments || []).length > 0 && (
          <div style={{ ...S.muted, marginBottom: 10 }}>
            Payments: {(booking.payments || []).map((p) => `${money(p.amount)} ${p.mode}`).join(", ")}
          </div>
        )}

        {canCharge && !closed && (
          <div style={S.fieldGap}>
            <div className="fd-label" style={{ marginBottom: 6 }}>Post a charge</div>
            <div style={S.row}>
              <select className="fd-select" style={{ width: 140 }} value={ch.cat} onChange={(e) => setCh({ ...ch, cat: e.target.value })}>
                {CHARGE_CATS.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input className="fd-input" style={{ flex: 1, minWidth: 120 }} placeholder="Details (optional)" value={ch.desc} onChange={(e) => setCh({ ...ch, desc: e.target.value })} />
              <input className="fd-input" style={{ width: 100 }} type="number" min="1" placeholder="Rs" value={ch.amount} onChange={(e) => setCh({ ...ch, amount: e.target.value })} />
              <button className="fd-btn-solid" disabled={chAmt <= 0} style={{ opacity: chAmt > 0 ? 1 : 0.5 }} onClick={() => { onCharge(booking.id, { cat: ch.cat, desc: ch.desc.trim(), amount: chAmt }); setCh({ ...ch, desc: "", amount: "" }); }}>Post</button>
            </div>
          </div>
        )}

        {canPay && !closed && due > 0 && (
          <div style={S.fieldGap}>
            <div className="fd-label" style={{ marginBottom: 6 }}>Receive payment</div>
            <div style={S.row}>
              <select className="fd-select" style={{ width: 150 }} value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}>
                {PAY_MODES.map((m) => <option key={m}>{m}</option>)}
              </select>
              <input className="fd-input" style={{ width: 120 }} type="number" min="1" max={due} placeholder="Rs" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
              <button className="fd-action-link" onClick={() => setPay({ ...pay, amount: String(due) })}>Full due</button>
              <button className="fd-btn-solid" disabled={payAmt <= 0 || payAmt > due} style={{ opacity: payAmt > 0 && payAmt <= due ? 1 : 0.5 }} onClick={() => { onPay(booking.id, { mode: pay.mode, amount: payAmt }); setPay({ ...pay, amount: "" }); }}>Record</button>
            </div>
          </div>
        )}

        <div style={S.row}>
          <button className="fd-btn-outline" onClick={() => onInvoice(booking)}><Icon name="download" size={14} color="var(--navy)" /> Download invoice</button>
          <button className="fd-btn-outline" onClick={() => window.print()}><Icon name="print" size={14} color="var(--navy)" /> Print</button>
        </div>
      </div>
    </Modal>
  );
}

/* Move an in-house guest to another room */
function MoveRoomModal({ booking, candidates, onClose, onConfirm }) {
  const [room, setRoom] = useState("");
  const [reason, setReason] = useState(MOVE_REASONS[0]);
  return (
    <Modal onClose={onClose} width={460}>
      <div className="fd-modal-inner">
        <ModalTitle title={`Move ${booking.name}`} sub={`Currently in Room ${booking.room} - leaving ${displayDate(booking.checkOut)}`} onClose={onClose} />
        {candidates.length === 0 && <div className="fd-modal-empty">No clean, vacant rooms are free for the rest of this stay.</div>}
        <div style={S.fieldGap}>
          <label className="fd-label">New room</label>
          <select className="fd-select" value={room} onChange={(e) => setRoom(e.target.value)}>
            <option value="">Select a room</option>
            {candidates.map((r) => <option key={r.number} value={r.number}>Room {r.number} - {r.type} - Floor {r.floor}</option>)}
          </select>
        </div>
        <div style={S.fieldGap}>
          <label className="fd-label">Reason</label>
          <select className="fd-select" value={reason} onChange={(e) => setReason(e.target.value)}>
            {MOVE_REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ ...S.muted, marginBottom: 12 }}>The old room goes to housekeeping as dirty. Open service requests move with the guest.</div>
        <button className="fd-submit-btn" disabled={!room} style={{ opacity: room ? 1 : 0.5 }} onClick={() => onConfirm(booking, room, reason)}>
          <Icon name="check" size={16} color="#fff" /> Confirm room move
        </button>
      </div>
    </Modal>
  );
}

/* =========================================================
   MAIN DASHBOARD
   ========================================================= */
export default function FrontDashboard() {
  /* core state (persisted in localStorage) */
  const [activeSection, setActiveSection] = useState("overview");
  const [rooms, setRooms] = usePersist("rooms", INITIAL_ROOMS);
  const [bookings, setBookings] = usePersist("bookings", INITIAL_BOOKINGS);
  const [notifications, setNotifications] = usePersist("notifications", INITIAL_NOTIFICATIONS);
  const [requests, setRequests] = usePersist("requests", INITIAL_REQUESTS);
  const [notes, setNotes] = usePersist("notes", INITIAL_NOTES);
  const [audit, setAudit] = usePersist("audit", INITIAL_AUDIT);
  const [guestMeta, setGuestMeta] = usePersist("guestMeta", {});
  const [now, setNow] = useState(new Date());
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  /* ui state */
  const [toast, setToast] = useState("");
  const [roomPanel, setRoomPanel] = useState(null);
  const [pickRoomFor, setPickRoomFor] = useState(null);
  const [checkInBooking, setCheckInBooking] = useState(null);
  const [checkOutBooking, setCheckOutBooking] = useState(null);
  const [passBooking, setPassBooking] = useState(null);
  const [folioId, setFolioId] = useState(null);
  const [moveBooking, setMoveBooking] = useState(null);
  const [historyRef, setHistoryRef] = useState(null);
  const [guestPhone, setGuestPhone] = useState(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [palQuery, setPalQuery] = useState("");
  const [palIdx, setPalIdx] = useState(0);
  const [headerSearch, setHeaderSearch] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [recordsTab, setRecordsTab] = useState("bookings");
  const [arrDate, setArrDate] = useState(TODAY);
  const [arrQuery, setArrQuery] = useState("");
  const [arrSort, setArrSort] = useState("eta");
  const [ihQuery, setIhQuery] = useState("");
  const [ihFloor, setIhFloor] = useState("All");
  const [ihDueOnly, setIhDueOnly] = useState(false);
  const [notifFilter, setNotifFilter] = useState("All");
  const [notifPrio, setNotifPrio] = useState("All");
  const [roomFilter, setRoomFilter] = useState({ status: "All", type: "All", floor: "All" });
  const [roomQuery, setRoomQuery] = useState("");
  const [roomView, setRoomView] = useState("grid");
  const [noteDraft, setNoteDraft] = useState({ text: "", room: "" });
  const [reqDraft, setReqDraft] = useState({ room: "", type: "Extra towels", priority: "Normal", desc: "" });
  const emptyDraft = { name: "", phone: "", email: "", idType: "Aadhaar", idNumber: "", purpose: "Leisure", roomType: "Single", source: "Walk-in", checkIn: TODAY, duration: 1, guests: 1, advance: 0, payMode: "Cash", meal: "No meals", preferredRoom: "", requests: "" };
  const [draft, setDraft] = useState(emptyDraft);
  const [formErrors, setFormErrors] = useState({});
  const [formOk, setFormOk] = useState(false);
  const toastTimer = useRef(null);
  const searchRef = useRef(null);

  /* navigation */
  const allowedNav = NAV_ITEMS; // this dashboard is for the front desk only
  const section = allowedNav.some((i) => i.key === activeSection) ? activeSection : "overview";

  /* clock, online status, keyboard shortcuts */
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { clearInterval(t); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o); setPalQuery(""); setPalIdx(0);
        return;
      }
      if (e.key === "Escape") {
        setPaletteOpen(false); setBellOpen(false); setQuickOpen(false);
        setRoomPanel(null); setPickRoomFor(null); setCheckInBooking(null); setCheckOutBooking(null);
        setPassBooking(null); setHistoryRef(null); setGuestPhone(null); setFolioId(null); setMoveBooking(null);
        return;
      }
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current && searchRef.current.focus(); }
      if (e.key === "n") setActiveSection("booking");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const nowHour = now.getHours() + now.getMinutes() / 60;

  /* ---------- helpers: toast, log, notifications ---------- */
  function showToast(msg) {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3600);
  }
  const log = (kind, text, ref, amount = 0) =>
    setAudit((p) => [{ id: uid(), ts: Date.now(), user: USER, kind, text, ref, amount }, ...p]);
  const pushNotif = (text, priority = "Info", type = "booking", link = "overview") =>
    setNotifications((p) => [{ id: uid(), text, priority, type, link, ts: Date.now(), read: false }, ...p]);
  const go = (key) => { setActiveSection(key); setBellOpen(false); setQuickOpen(false); setPaletteOpen(false); };

  /* ---------- derived data ---------- */
  const arrivalsAll = bookings.filter((b) => b.checkIn === TODAY && ACTIVE.includes(b.status));
  const arrivalsPending = arrivalsAll.filter((b) => b.status !== "Checked-In");
  const departuresAll = bookings.filter((b) => b.checkOut === TODAY && ["Checked-In", "Checked-Out"].includes(b.status));
  const departuresPending = departuresAll.filter((b) => b.status === "Checked-In");
  const overdue = departuresPending.filter((b) => !b.lateCheckout && nowHour >= CHECKOUT_HOUR);
  const lateArrivals = arrivalsPending.filter((b) => nowHour >= NOSHOW_HOUR);
  const inHouse = bookings.filter((b) => b.status === "Checked-In");
  const openRequests = requests.filter((r) => r.status !== "Done");
  const guestByRoom = {};
  inHouse.forEach((b) => { guestByRoom[b.room] = b; });

  const stats = useMemo(() => {
    const c = (fn) => rooms.filter(fn).length;
    const total = rooms.length;
    const occupied = c((r) => r.status === "occupied");
    const outOfService = c((r) => r.status === "outOfService");
    return {
      total, occupied, outOfService,
      vacant: c((r) => r.status === "available"),
      reserved: c((r) => r.status === "reserved"),
      dirty: c((r) => r.status === "cleaning" && r.hk === "dirty"),
      cleaning: c((r) => r.status === "cleaning" && r.hk !== "dirty"),
      occupancy: total - outOfService ? Math.round((occupied / (total - outOfService)) * 100) : 0,
    };
  }, [rooms]);

  /* revenue KPIs */
  const sellable = stats.total - stats.outOfService || 1;
  const outstanding = inHouse.reduce((s, b) => s + dueOf(b), 0);
  const readyPct = Math.round(((sellable - stats.dirty - stats.cleaning) / sellable) * 100);

  const liveAlerts = useMemo(() => {
    const a = [];
    overdue.forEach((b) => a.push({ id: "ov" + b.id, text: `Room ${b.room} check-out overdue (${b.name}).`, priority: "Warning", type: "booking", link: "arrivals", ts: Date.now(), read: false, live: true }));
    lateArrivals.forEach((b) => a.push({ id: "la" + b.id, text: `${b.name} (${b.id}) not checked in by 6:00 PM.`, priority: "Warning", type: "booking", link: "arrivals", ts: Date.now(), read: false, live: true }));
    departuresPending.forEach((b) => {
      if (dueOf(b) > 0) a.push({ id: "du" + b.id, text: `Room ${b.room} leaves today with ${money(dueOf(b))} unpaid (${b.name}).`, priority: "Info", type: "booking", link: "inhouse", ts: Date.now(), read: false, live: true });
    });
    arrivalsPending.forEach((b) => {
      const r = rooms.find((x) => x.number === b.room);
      if (!b.room) a.push({ id: "un" + b.id, text: `${b.name} arrives today with no room assigned.`, priority: "Warning", type: "rooms", link: "arrivals", ts: Date.now(), read: false, live: true });
      else if (r && r.status === "cleaning") a.push({ id: "nr" + b.id, text: `Room ${b.room} is not ready for ${b.name} (${roomLabel(r)}).`, priority: "Urgent", type: "rooms", link: "rooms", ts: Date.now(), read: false, live: true });
    });
    return a;
  }, [overdue.length, lateArrivals.length, arrivalsPending, departuresPending, rooms]); // eslint-disable-line

  const allNotifs = [...liveAlerts, ...notifications];
  const unreadCount = allNotifs.filter((n) => !n.read).length;

  /* ---------- booking form ---------- */
  const nightsDraft = Number(draft.duration) || 0;
  const draftCheckOut = addDays(draft.checkIn || TODAY, nightsDraft);
  const availableForDraft = rooms.filter(
    (r) => r.type === draft.roomType && r.status !== "outOfService" &&
      (draft.checkIn !== TODAY || r.status === "available") &&
      roomFree(bookings, r.number, draft.checkIn, draftCheckOut)
  );
  const matchedGuest = draft.phone.length === 10 ? bookings.find((b) => b.phone === draft.phone) : null;
  const matchedMeta = matchedGuest ? guestMeta[matchedGuest.phone] || {} : {};
  const overlapStay = draft.phone.length === 10
    ? bookings.find((b) => b.phone === draft.phone && ACTIVE.includes(b.status) && draft.checkIn < b.checkOut && draftCheckOut > b.checkIn)
    : null;
  const setD = (k, v) => setDraft((d) => ({ ...d, [k]: v, ...(k === "roomType" || k === "checkIn" || k === "duration" ? { preferredRoom: "" } : {}) }));

  /* price breakdown for the summary panel */
  const mealPN = (MEALS[draft.meal] || 0) * (Number(draft.guests) || 0);
  const roomBase = (RATES[draft.roomType] || 0) * nightsDraft;
  const mealBase = mealPN * nightsDraft;
  const subtotal = roomBase + mealBase;
  const gstAmt = Math.round(subtotal * (GST - 1));
  const draftTotal = Math.round(subtotal * GST);
  const draftBalance = Math.max(draftTotal - (Number(draft.advance) || 0), 0);

  function handleBookingSubmit(e) {
    e.preventDefault();
    const errs = {};
    if (!draft.name.trim()) errs.name = "Enter the guest's full name.";
    if (!/^\d{10}$/.test(draft.phone)) errs.phone = "Enter a valid 10-digit number.";
    if (draft.email && !/^\S+@\S+\.\S+$/.test(draft.email)) errs.email = "Enter a valid email address or leave it empty.";
    if (!draft.idNumber.trim()) errs.idNumber = "Enter an ID number.";
    if (!draft.checkIn) errs.checkIn = "Select a check-in date.";
    else if (draft.checkIn < TODAY) errs.checkIn = "Check-in cannot be in the past.";
    if (nightsDraft < 1) errs.duration = "Enter at least 1 night (check-out must be after check-in).";
    if (Number(draft.guests) < 1) errs.guests = "Enter at least 1 guest.";
    else if (Number(draft.guests) > CAP[draft.roomType]) errs.guests = `${draft.roomType} rooms fit ${CAP[draft.roomType]} guests. Pick a bigger room type.`;
    if (Number(draft.advance) < 0) errs.advance = "Advance cannot be negative.";
    else if (Number(draft.advance) > draftTotal) errs.advance = `Advance is more than the total (${money(draftTotal)}).`;
    if (draft.preferredRoom && !roomFree(bookings, draft.preferredRoom, draft.checkIn, draftCheckOut)) {
      errs.preferredRoom = "That room is already booked for these dates.";
      pushNotif(`Double-booking attempt blocked for Room ${draft.preferredRoom}.`, "Urgent", "rooms", "rooms");
    }
    setFormErrors(errs);
    if (Object.keys(errs).length) { setFormOk(false); return; }

    const adv = Number(draft.advance) || 0;
    const nb = mk({
      id: "BK" + Math.floor(1100 + Math.random() * 8899),
      name: draft.name.trim(), phone: draft.phone, email: draft.email, idType: draft.idType, idNumber: draft.idNumber.trim(),
      purpose: draft.purpose, roomType: draft.roomType, guests: Number(draft.guests), source: draft.source, requests: draft.requests,
      checkIn: draft.checkIn, checkOut: draftCheckOut, paid: adv,
      meal: draft.meal, mealPerNight: mealPN, total: draftTotal,
      payments: adv > 0 ? [{ id: uid(), ts: Date.now(), mode: draft.payMode, amount: adv }] : [],
      status: draft.preferredRoom ? "Confirmed" : "Pending", room: draft.preferredRoom || null,
    });
    setBookings((p) => [nb, ...p]);
    if (draft.preferredRoom && nb.checkIn === TODAY) setRooms((p) => p.map((r) => (r.number === draft.preferredRoom ? { ...r, status: "reserved" } : r)));
    log("booking", `Created booking for ${nb.name} (${nb.status})`, nb.id, nb.paid);
    pushNotif(`New booking ${nb.status.toLowerCase()} for ${nightsDraft} night(s) - ${nb.name}.`, "Info", "booking", "overview");
    showToast(`Booking ${nb.id} created for ${nb.name} (${nb.status}).`);
    setDraft(emptyDraft);
    setFormOk(true);
    window.setTimeout(() => setFormOk(false), 3500);
  }

  /* ---------- room + booking actions ---------- */
  function assignRoomToBooking(bookingId, roomNumber) {
    const b = bookings.find((x) => x.id === bookingId);
    const r = rooms.find((x) => x.number === roomNumber);
    if (!b || !r) return false;
    if (!roomFree(bookings, roomNumber, b.checkIn, b.checkOut, b.id)) {
      showToast(`Room ${roomNumber} is already booked for those dates.`);
      pushNotif(`Double-booking attempt blocked for Room ${roomNumber}.`, "Urgent", "rooms", "rooms");
      return false;
    }
    setBookings((p) => p.map((x) => (x.id === bookingId ? { ...x, room: roomNumber, status: x.status === "Pending" ? "Confirmed" : x.status } : x)));
    setRooms((p) => p.map((x) => {
      if (x.number === roomNumber && b.checkIn === TODAY && x.status === "available") return { ...x, status: "reserved" };
      if (b.room && b.room !== roomNumber && x.number === b.room && x.status === "reserved") return { ...x, status: "available" };
      return x;
    }));
    log("assign", `Room ${roomNumber} allocated to ${b.name}`, b.id);
    showToast(`Room ${roomNumber} allocated to booking ${bookingId}.`);
    return true;
  }

  function handleCheckInConfirm(b, roomNumber, advance) {
    const r = rooms.find((x) => x.number === roomNumber);
    if (!r || !(r.status === "available" || (r.status === "reserved" && b.room === roomNumber))) {
      showToast(`Room ${roomNumber} is not ready for check-in.`);
      return;
    }
    if (!roomFree(bookings, roomNumber, b.checkIn, b.checkOut, b.id)) { showToast(`Room ${roomNumber} is booked by another guest.`); return; }
    const updated = {
      ...b, room: roomNumber, status: "Checked-In", paid: b.paid + advance,
      payments: advance > 0 ? [...(b.payments || []), { id: uid(), ts: Date.now(), mode: "Cash", amount: advance }] : b.payments || [],
    };
    setBookings((p) => p.map((x) => (x.id === b.id ? updated : x)));
    setRooms((p) => p.map((x) => {
      if (x.number === roomNumber) return { ...x, status: "occupied" };
      if (b.room && b.room !== roomNumber && x.number === b.room && x.status === "reserved") return { ...x, status: "available" };
      return x;
    }));
    log("checkin", `Checked in ${b.name} to Room ${roomNumber}`, b.id, advance);
    pushNotif(`${b.name} checked into Room ${roomNumber}. Housekeeping and billing notified.`, "Info", "booking", "inhouse");
    setCheckInBooking(null);
    setPassBooking(updated);
  }

  function handleCheckOutConfirm(b, settled, mode) {
    const due = dueOf(b);
    setBookings((p) => p.map((x) => (x.id === b.id ? {
      ...x, status: "Checked-Out",
      paid: settled ? grandOf(x) : x.paid,
      payments: settled && due > 0 ? [...(x.payments || []), { id: uid(), ts: Date.now(), mode, amount: due }] : x.payments || [],
    } : x)));
    if (b.room) setRooms((p) => p.map((r) => (r.number === b.room ? { number: r.number, floor: r.floor, type: r.type, status: "cleaning", hk: "dirty" } : r)));
    log("checkout", `Checked out ${b.name} from Room ${b.room}`, b.id, settled ? due : 0);
    pushNotif(`Room ${b.room} needs cleaning - ${b.name} checked out.`, "Info", "rooms", "rooms");
    setCheckOutBooking(null);
    showToast(`${b.name} checked out. Room ${b.room} sent to housekeeping.`);
  }

  function handleRoomMove(b, newRoom, reason) {
    setBookings((p) => p.map((x) => (x.id === b.id ? { ...x, room: newRoom } : x)));
    setRooms((p) => p.map((r) => {
      if (r.number === newRoom) return { ...r, status: "occupied" };
      if (r.number === b.room) return { number: r.number, floor: r.floor, type: r.type, status: "cleaning", hk: "dirty" };
      return r;
    }));
    setRequests((p) => p.map((r) => (r.room === b.room && r.status !== "Done" ? { ...r, room: newRoom } : r)));
    log("move", `Moved ${b.name} from Room ${b.room} to Room ${newRoom} (${reason})`, b.id);
    pushNotif(`${b.name} moved from Room ${b.room} to Room ${newRoom}. Old room needs cleaning.`, "Info", "rooms", "rooms");
    setMoveBooking(null);
    showToast(`${b.name} moved to Room ${newRoom}.`);
  }

  function addCharge(id, ch) {
    const b = bookings.find((x) => x.id === id);
    setBookings((p) => p.map((x) => (x.id === id ? { ...x, charges: [...(x.charges || []), { id: uid(), ts: Date.now(), ...ch }] } : x)));
    log("folio", `Posted ${ch.cat} charge ${money(ch.amount)} to Room ${b ? b.room : ""}`, id);
    showToast(`${money(ch.amount)} ${ch.cat.toLowerCase()} charge posted.`);
  }
  function addPayment(id, pay) {
    const b = bookings.find((x) => x.id === id);
    setBookings((p) => p.map((x) => (x.id === id ? { ...x, paid: x.paid + pay.amount, payments: [...(x.payments || []), { id: uid(), ts: Date.now(), ...pay }] } : x)));
    log("payment", `Received ${money(pay.amount)} (${pay.mode}) from ${b ? b.name : "guest"}`, id, pay.amount);
    showToast(`${money(pay.amount)} received by ${pay.mode}.`);
  }

  function releaseRoom(b) {
    if (b.room) setRooms((p) => p.map((r) => (r.number === b.room && r.status === "reserved" ? { ...r, status: "available" } : r)));
  }
  function cancelBooking(id) {
    const b = bookings.find((x) => x.id === id);
    if (!b) return;
    setBookings((p) => p.map((x) => (x.id === id ? { ...x, status: "Cancelled" } : x)));
    releaseRoom(b);
    log("cancel", `Cancelled booking for ${b.name}`, id);
    pushNotif(`Booking ${id} cancelled (${b.name}).`, "Info", "booking", "records");
    showToast(`Booking ${id} cancelled. Room released.`);
  }
  function markNoShow(b) {
    setBookings((p) => p.map((x) => (x.id === b.id ? { ...x, status: "No-show" } : x)));
    releaseRoom(b);
    log("noshow", `Marked ${b.name} as no-show`, b.id);
    showToast(`${b.name} marked as no-show. Room released.`);
  }
  function extendStay(b) {
    const newCo = addDays(b.checkOut, 1);
    if (!roomFree(bookings, b.room, b.checkOut, newCo, b.id)) { showToast(`Room ${b.room} is booked on ${displayDate(b.checkOut)}. Offer a room change instead.`); return; }
    const total = b.total + estimate(b.roomType, 1) + Math.round((b.mealPerNight || 0) * GST);
    setBookings((p) => p.map((x) => (x.id === b.id ? { ...x, checkOut: newCo, total } : x)));
    log("extend", `Extended ${b.name} to ${displayDate(newCo)}`, b.id);
    showToast(`${b.name} extended to ${displayDate(newCo)}.`);
  }
  function requestLateCheckout(b) {
    setBookings((p) => p.map((x) => (x.id === b.id ? { ...x, lateCheckout: true } : x)));
    log("extend", `Late check-out approved for ${b.name}`, b.id);
    showToast(`Late check-out noted for Room ${b.room}.`);
  }
  function sendReminder(b) {
    log("note", `Arrival reminder SMS queued for ${b.name} (${b.phone})`, b.id);
    showToast(`Reminder SMS queued for ${b.name}.`);
  }

  /* housekeeping + room blocking */
  function advanceHousekeeping(room) {
    if (room.hk === "dirty") {
      setRooms((p) => p.map((r) => (r.number === room.number ? { ...r, hk: "cleaning" } : r)));
      log("room", `Room ${room.number} set to Under cleaning`, room.number);
    } else {
      setRooms((p) => p.map((r) => (r.number === room.number ? { number: r.number, floor: r.floor, type: r.type, status: "available" } : r)));
      log("room", `Room ${room.number} marked clean and ready`, room.number);
      pushNotif(`Room ${room.number} cleaned and ready for check-in.`, "Info", "rooms", "rooms");
    }
  }
  function toggleBlock(room) {
    if (room.status === "outOfService") {
      setRooms((p) => p.map((r) => (r.number === room.number ? { number: r.number, floor: r.floor, type: r.type, status: "available" } : r)));
      log("room", `Room ${room.number} returned to service`, room.number);
    } else if (room.status === "available") {
      const reason = window.prompt(`Why is Room ${room.number} being blocked?`, "Maintenance");
      if (reason === null) return;
      setRooms((p) => p.map((r) => (r.number === room.number ? { ...r, status: "outOfService", note: reason.trim() || "Blocked by front desk" } : r)));
      log("room", `Room ${room.number} blocked (${reason.trim() || "no reason"})`, room.number);
    } else {
      showToast("Only vacant rooms can be blocked.");
    }
    setRoomPanel(null);
  }

  /* service requests + notes */
  function addRequest(e) {
    e.preventDefault();
    if (!reqDraft.room) { showToast("Select a room for the request."); return; }
    const r = { id: uid(), ...reqDraft, status: "New", ts: Date.now() };
    setRequests((p) => [r, ...p]);
    log("request", `${r.type} requested for Room ${r.room}`, r.room);
    pushNotif(`Room ${r.room} requests: ${r.type}.`, r.priority === "High" ? "Warning" : "Info", "requests", "requests");
    setReqDraft({ room: "", type: "Extra towels", priority: "Normal", desc: "" });
    showToast("Service request created.");
  }
  function advanceRequest(id) {
    setRequests((p) => p.map((r) => (r.id === id ? { ...r, status: REQUEST_STEPS[Math.min(REQUEST_STEPS.indexOf(r.status) + 1, 3)] } : r)));
  }
  function addNote(e) {
    e.preventDefault();
    if (!noteDraft.text.trim()) return;
    setNotes((p) => [{ id: uid(), text: noteDraft.text.trim(), room: noteDraft.room, author: USER, shift: shiftOf(now.getHours()), ts: Date.now() }, ...p]);
    log("note", "Added shift note", noteDraft.room || "-");
    setNoteDraft({ text: "", room: "" });
  }

  /* notifications */
  function markRead(id) { setNotifications((p) => p.map((n) => (n.id === id ? { ...n, read: true } : n))); }
  function markAllRead() { setNotifications((p) => p.map((n) => ({ ...n, read: true }))); }
  function clearRead() { setNotifications((p) => p.filter((n) => !n.read)); showToast("Read notifications cleared."); }

  /* downloads */
  function saveBlob(text, type, name) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }
  function downloadPass(b) {
    saveBlob(
`THE REGAL COURT HOTEL - DIGITAL CHECK-IN PASS
--------------------------------------
Pass / Booking ID: ${b.id}
Guest Name:        ${b.name}
Room Number:       ${b.room}
Check-In:          ${displayDate(b.checkIn)} (from ${CHECKIN_HOUR}:00)
Check-Out:         ${displayDate(b.checkOut)} (by ${CHECKOUT_HOUR}:00)
Guests:            ${b.guests}
--------------------------------------
Present this pass at the front desk if requested.`, "text/plain", `CheckInPass_${b.id}.txt`);
  }
  function downloadInvoice(b) {
    const rows = (b.charges || []).map((c) => `  ${c.cat.padEnd(14)} ${(c.desc || "").slice(0, 24).padEnd(24)} ${money(c.amount)}`).join("\n") || "  (no extra charges)";
    const pays = (b.payments || []).map((p) => `  ${displayDate(toISO(new Date(p.ts)))}  ${p.mode.padEnd(14)} ${money(p.amount)}`).join("\n") || "  (no payments recorded)";
    saveBlob(
`THE REGAL COURT HOTEL - GUEST INVOICE
======================================
Invoice for:  ${b.name} (${b.phone})
Booking:      ${b.id}   Room ${b.room || "-"} (${b.roomType})
Stay:         ${displayDate(b.checkIn)} to ${displayDate(b.checkOut)} (${nightsBetween(b.checkIn, b.checkOut)} night(s))
Meal plan:    ${b.meal || "No meals"}
--------------------------------------
Room and meals (incl. 12% GST):  ${money(b.total)}
Extra charges:
${rows}
--------------------------------------
Grand total:  ${money(grandOf(b))}
Payments:
${pays}
Paid:         ${money(b.paid)}
BALANCE DUE:  ${money(dueOf(b))}
======================================
Generated ${new Date().toLocaleString("en-IN")} by ${USER}`, "text/plain", `Invoice_${b.id}.txt`);
  }

  /* ---------- filtered / derived lists ---------- */
  const filteredBookings = useMemo(() => {
    let list = bookings;
    if (statusFilter !== "All") list = list.filter((b) => b.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((b) => b.name.toLowerCase().includes(q) || b.phone.includes(q) || b.id.toLowerCase().includes(q) || (b.room || "") === q || b.idNumber.toLowerCase().includes(q));
    }
    return list;
  }, [bookings, statusFilter, search]);

  const guests = useMemo(() => {
    const map = {};
    bookings.forEach((b) => {
      const g = map[b.phone] || (map[b.phone] = { phone: b.phone, name: b.name, idType: b.idType, idNumber: b.idNumber, email: b.email, stays: [] });
      g.stays.push(b);
    });
    let list = Object.values(map);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((g) => g.name.toLowerCase().includes(q) || g.phone.includes(q) || g.idNumber.toLowerCase().includes(q));
    }
    return list;
  }, [bookings, search]);

  const rq = roomQuery.trim().toLowerCase();
  const filteredRooms = rooms.filter((r) =>
    (roomFilter.status === "All" || r.status === roomFilter.status) &&
    (roomFilter.type === "All" || r.type === roomFilter.type) &&
    (roomFilter.floor === "All" || String(r.floor) === roomFilter.floor) &&
    (!rq || r.number.includes(rq) || (guestByRoom[r.number] ? guestByRoom[r.number].name.toLowerCase().includes(rq) : false))
  );
  const roomsByFloor = useMemo(() => {
    const map = {};
    filteredRooms.forEach((r) => { (map[r.floor] = map[r.floor] || []).push(r); });
    return map;
  }, [filteredRooms]); // eslint-disable-line

  const forecast = useMemo(() => {
    const sell = rooms.filter((r) => r.status !== "outOfService").length || 1;
    return Array.from({ length: 7 }).map((_, i) => {
      const d = fmtDate(i);
      const n = bookings.filter((b) => ACTIVE.includes(b.status) && b.checkIn <= d && b.checkOut > d).length;
      return { d, n, pct: Math.min(100, Math.round((n / sell) * 100)) };
    });
  }, [bookings, rooms]);

  const pendingBookings = bookings.filter((b) => b.status === "Pending");
  const todaysAudit = audit.filter((a) => toISO(new Date(a.ts)) === TODAY);
  const countKind = (k) => todaysAudit.filter((a) => a.kind === k).length;
  const paymentsToday = todaysAudit.reduce((s, a) => s + (a.amount || 0), 0);

  const billChip = (b) => {
    const due = dueOf(b);
    if (due <= 0) return <span style={S.chip("var(--green)")}>Paid</span>;
    return <span style={S.chip(b.paid > 0 ? "var(--amber)" : "var(--red)")}>{b.paid > 0 ? "Partial" : "Pending"} {money(due)}</span>;
  };
  const readyChip = (b) => {
    if (!b.room) return <span style={S.chip("var(--amber)")}>Unassigned</span>;
    const r = rooms.find((x) => x.number === b.room);
    const ready = r && (r.status === "available" || r.status === "reserved" || r.status === "occupied");
    return <span style={S.chip(ready ? "var(--green)" : "var(--blue)")}>{ready ? "Room ready" : "Cleaning"}</span>;
  };
  const stayPct = (b) => {
    const n = Math.max(nightsBetween(b.checkIn, b.checkOut), 1);
    return Math.min(100, Math.max(0, Math.round((nightsBetween(b.checkIn, TODAY) / n) * 100)));
  };

  /* =======================================================
     REUSABLE RENDER BLOCKS
     ======================================================= */
  const aq = arrQuery.trim().toLowerCase();
  const matchQ = (b) => !aq || [b.name, b.phone, b.id, b.room || ""].join(" ").toLowerCase().includes(aq);
  const cmp = (a, b) =>
    arrSort === "name" ? a.name.localeCompare(b.name)
      : arrSort === "room" ? (a.room || "zzz").localeCompare(b.room || "zzz")
        : (a.eta || "99:99").localeCompare(b.eta || "99:99");

  function renderArrivals(date, title = "Arrivals", adv = false) {
    const all = bookings.filter((b) => b.checkIn === date && ACTIVE.includes(b.status));
    const list = adv ? all.filter(matchQ).sort(cmp) : all;
    const isToday = date === TODAY;
    const done = all.filter((b) => b.status === "Checked-In").length;
    return (
      <div className="fd-card">
        <SectionHeader eyebrow={isToday ? "Today" : displayDate(date)} title={title} />
        {adv && all.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ ...S.muted, marginBottom: 4 }}>{done} of {all.length} checked in</div>
            <div className="fx-bar"><span style={{ width: `${(done / all.length) * 100}%`, background: "var(--green)" }} /></div>
          </div>
        )}
        {list.length === 0 && <div className="fd-empty-note">{all.length ? "No arrivals match your search." : "No arrivals pending for this date."}</div>}
        {list.length > 0 && (
          <div className="fd-table-wrap">
            <table className="fd-table">
              <thead><tr><th>Guest</th><th>Room</th><th>Expected</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {list.map((b) => {
                  const late = isToday && b.status !== "Checked-In" && nowHour >= NOSHOW_HOUR;
                  return (
                    <tr key={b.id}>
                      <td>
                        <div className="fd-guest-name">{b.name}</div>
                        <div className="fd-guest-phone">{b.id} - {nightsBetween(b.checkIn, b.checkOut)} night(s), {b.guests} guest(s)</div>
                        {b.requests && <div style={S.muted}>Note: {b.requests}</div>}
                      </td>
                      <td>{b.room || "-"}<div>{readyChip(b)}</div></td>
                      <td className="fd-nowrap">{b.eta || "-"}{late && <div><span style={S.chip("var(--red)")}>Late</span></div>}</td>
                      <td><span className={`fd-status-pill badge-${b.status}`}>{b.status}</span></td>
                      <td>
                        <div style={S.row}>
                          {b.status === "Checked-In" && <button className="fd-action-link" onClick={() => setPassBooking(b)}>View pass</button>}
                          {isToday && b.status !== "Checked-In" && !b.room && <button className="fd-btn-checkin" onClick={() => setPickRoomFor(b)}>Assign room</button>}
                          {isToday && b.status !== "Checked-In" && b.room && <button className="fd-btn-checkin" onClick={() => setCheckInBooking(b)}>Check in</button>}
                          {adv && isToday && b.status !== "Checked-In" && <button className="fd-action-link" onClick={() => sendReminder(b)}>Remind</button>}
                          {late && <button className="fd-action-link fd-action-link-danger" onClick={() => markNoShow(b)}>No-show</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderDepartures(date, title = "Departures", adv = false) {
    const all = bookings.filter((b) => b.checkOut === date && ["Checked-In", "Checked-Out"].includes(b.status));
    const list = adv ? all.filter(matchQ).sort(arrSort === "name" ? cmp : (a, b) => (a.room || "").localeCompare(b.room || "")) : all;
    const isToday = date === TODAY;
    const dueTotal = all.filter((b) => b.status === "Checked-In").reduce((s, b) => s + dueOf(b), 0);
    return (
      <div className="fd-card">
        <SectionHeader eyebrow={isToday ? "Today" : displayDate(date)} title={title} />
        {adv && all.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ ...S.muted, marginBottom: 4 }}>{all.filter((b) => b.status === "Checked-Out").length} of {all.length} departed - {money(dueTotal)} still to collect</div>
            <div className="fx-bar"><span style={{ width: `${(all.filter((b) => b.status === "Checked-Out").length / all.length) * 100}%`, background: "var(--blue)" }} /></div>
          </div>
        )}
        {list.length === 0 && <div className="fd-empty-note">{all.length ? "No departures match your search." : "No departures pending for this date."}</div>}
        {list.length > 0 && (
          <div className="fd-table-wrap">
            <table className="fd-table">
              <thead><tr><th>Guest</th><th>Room</th><th>Check-out</th><th>Bill</th><th>Action</th></tr></thead>
              <tbody>
                {list.map((b) => {
                  const od = isToday && b.status === "Checked-In" && !b.lateCheckout && nowHour >= CHECKOUT_HOUR;
                  return (
                    <tr key={b.id}>
                      <td><div className="fd-guest-name">{b.name}</div><div className="fd-guest-phone">{b.id}</div></td>
                      <td>{b.room}</td>
                      <td className="fd-nowrap">
                        {CHECKOUT_HOUR}:00 AM
                        {od && <div><span style={S.chip("var(--red)")}>Overdue</span></div>}
                        {b.lateCheckout && <div><span style={S.chip("var(--blue)")}>Late C/O</span></div>}
                      </td>
                      <td>{billChip(b)}</td>
                      <td>
                        <div style={S.row}>
                          {b.status === "Checked-Out" && <span style={S.chip("var(--grey)")}>Departed</span>}
                          {b.status === "Checked-In" && isToday && <button className="fd-btn-checkout" onClick={() => setCheckOutBooking(b)}>Check out</button>}
                          {b.status === "Checked-In" && isToday && <button className="fd-action-link" onClick={() => extendStay(b)}>Extend</button>}
                          {b.status === "Checked-In" && isToday && !b.lateCheckout && <button className="fd-action-link" onClick={() => requestLateCheckout(b)}>Late C/O</button>}
                          {<button className="fd-action-link" onClick={() => setFolioId(b.id)}>Folio</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderRequestRow(r) {
    return (
      <div key={r.id} className="fd-list-row">
        <div>
          <div className="fd-list-name">Room {r.room} - {r.type}</div>
          <div className="fd-list-sub">{r.desc || "No details"} - {ago(r.ts)}</div>
          <div style={{ marginTop: 4, ...S.row }}>
            <span style={S.chip(PRIORITY_COLOR[r.priority])}>{r.priority}</span>
            <span style={S.chip(r.status === "Done" ? "var(--green)" : "var(--navy)")}>{r.status}</span>
          </div>
        </div>
        {r.status !== "Done" && (
          <button className="fd-btn-checkin" onClick={() => advanceRequest(r.id)}>Mark {REQUEST_STEPS[REQUEST_STEPS.indexOf(r.status) + 1]}</button>
        )}
      </div>
    );
  }

  const roomPanelRoom = roomPanel ? rooms.find((r) => r.number === roomPanel) : null;
  const guestProfile = (() => {
    if (!guestPhone) return null;
    const stays = bookings.filter((b) => b.phone === guestPhone);
    return stays.length ? { phone: guestPhone, name: stays[0].name, idType: stays[0].idType, idNumber: stays[0].idNumber, email: stays[0].email, stays } : null;
  })();
  const checkInCandidates = checkInBooking
    ? rooms.filter((r) => r.status === "available" && roomFree(bookings, r.number, checkInBooking.checkIn, checkInBooking.checkOut, checkInBooking.id))
    : [];
  const pickCandidates = pickRoomFor
    ? rooms.filter((r) => r.status !== "outOfService" && roomFree(bookings, r.number, pickRoomFor.checkIn, pickRoomFor.checkOut, pickRoomFor.id) && (pickRoomFor.checkIn !== TODAY || r.status === "available"))
        .sort((a, b) => (a.type === pickRoomFor.roomType ? -1 : 1) - (b.type === pickRoomFor.roomType ? -1 : 1))
    : [];
  const moveCandidates = moveBooking
    ? rooms.filter((r) => r.status === "available" && roomFree(bookings, r.number, TODAY, moveBooking.checkOut, moveBooking.id))
    : [];
  const folioBooking = folioId ? bookings.find((b) => b.id === folioId) : null;

  /* in-house filtering */
  const iq = ihQuery.trim().toLowerCase();
  const inHouseList = inHouse.filter((b) => {
    const fl = rooms.find((r) => r.number === b.room);
    return (!iq || [b.name, b.phone, b.room || ""].join(" ").toLowerCase().includes(iq)) &&
      (ihFloor === "All" || (fl && String(fl.floor) === ihFloor)) &&
      (!ihDueOnly || dueOf(b) > 0);
  });

  /* command palette items */
  const pq = palQuery.trim().toLowerCase();
  const paletteItems = [
    ...allowedNav.map((i) => ({ label: `Go to ${i.label}`, run: () => go(i.key) })),
    { label: "Create walk-in booking", run: () => { setD("source", "Walk-in"); setD("checkIn", TODAY); go("booking"); } },
    { label: "Print current page", run: () => window.print() },
    ...(pq.length >= 2
      ? bookings.filter((b) => [b.name, b.phone, b.id, b.room || ""].join(" ").toLowerCase().includes(pq)).slice(0, 6)
          .flatMap((b) => [
            { label: `Guest: ${b.name} (${b.id})`, run: () => setGuestPhone(b.phone) },
            { label: `Folio: ${b.name} (${b.id})`, run: () => setFolioId(b.id) },
          ])
      : []),
  ].filter((it) => !pq || it.label.toLowerCase().includes(pq));
  function runPalette(it) { if (!it) return; setPaletteOpen(false); it.run(); }

  /* =======================================================
     RENDER
     ======================================================= */
  const donutData = [
    { label: "Occupied", value: stats.occupied, color: "var(--red)" },
    { label: "Vacant - ready", value: stats.vacant, color: "var(--green)" },
    { label: "Reserved", value: stats.reserved, color: "var(--gold)" },
    { label: "Vacant - dirty", value: stats.dirty, color: "var(--amber)" },
    { label: "Being cleaned", value: stats.cleaning, color: "var(--blue)" },
    { label: "Out of service", value: stats.outOfService, color: "var(--grey)" },
  ];

  return (
    <div className="fd-app fd-app-with-sidebar">
      <style>{EXTRA_CSS}</style>

      {/* HEADER */}
      <header className="fd-header">
        <div className="fd-header-left">
          <div className="fd-logo-circle"><Icon name="key" size={20} color="var(--gold-light)" /></div>
          <div>
            <div className="fd-hotel-name">VEYRA</div>
            <div className="fd-hotel-sub">Front Desk Dashboard</div>
          </div>
        </div>

        <div className="fd-header-right">
          <form onSubmit={(e) => { e.preventDefault(); setSearch(headerSearch); setRecordsTab("bookings"); setStatusFilter("All"); go("records"); }} style={{ display: "flex" }}>
            <input ref={searchRef} className="fd-input" style={{ width: 210, height: 32 }} placeholder="Search guest, phone, ID, room  ( / )" value={headerSearch} onChange={(e) => setHeaderSearch(e.target.value)} />
          </form>

          <button className="fd-logout-btn" title="Command palette" onClick={() => { setPaletteOpen(true); setPalQuery(""); setPalIdx(0); }}>Ctrl+K</button>

          <div style={{ position: "relative" }}>
            <button className="fd-logout-btn" onClick={() => { setQuickOpen(!quickOpen); setBellOpen(false); }} title="Quick actions">
              <Icon name="plus" size={14} color="var(--gold-light)" /> Quick add
            </button>
            {quickOpen && (
              <div className="fd-card" style={{ position: "absolute", right: 0, top: 38, zIndex: 50, minWidth: 190, padding: 8 }}>
                {<button className="fd-action-link" style={{ display: "block", padding: 6 }} onClick={() => { setD("source", "Walk-in"); setD("checkIn", TODAY); go("booking"); }}>New booking / walk-in</button>}
                {<button className="fd-action-link" style={{ display: "block", padding: 6 }} onClick={() => go("requests")}>New service request</button>}
                {<button className="fd-action-link" style={{ display: "block", padding: 6 }} onClick={() => go("overview")}>Add shift note</button>}
              </div>
            )}
          </div>

          <div className="fd-datetime">
            <div>{dateStr}</div>
            <div className="fd-time">{timeStr} - {shiftOf(now.getHours())} shift</div>
          </div>

          <div style={{ position: "relative" }}>
            <div className="fd-bell-wrap" onClick={() => { setBellOpen(!bellOpen); setQuickOpen(false); }} style={{ cursor: "pointer" }}>
              <Icon name="bell" size={20} color="var(--gold-light)" />
              {unreadCount > 0 && <span className="fd-bell-badge">{unreadCount}</span>}
            </div>
            {bellOpen && (
              <div className="fd-card" style={{ position: "absolute", right: 0, top: 36, zIndex: 50, width: 320, padding: 10 }}>
                {allNotifs.slice(0, 5).map((n) => (
                  <div key={n.id} style={{ padding: "6px 4px", borderBottom: "1px solid var(--border, #eee)", cursor: "pointer" }} onClick={() => { if (!n.live) markRead(n.id); go(n.link); }}>
                    <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600 }}>{n.text}</div>
                    <div style={S.muted}>{n.priority} - {ago(n.ts)}</div>
                  </div>
                ))}
                {allNotifs.length === 0 && <div className="fd-empty-note">You're all caught up.</div>}
                <button className="fd-action-link" style={{ marginTop: 6 }} onClick={() => go("notifications")}>View all notifications</button>
              </div>
            )}
          </div>

          <div className="fd-user">
            <div className="fd-avatar"><Icon name="user" size={15} color="var(--gold-light)" /></div>
            <span className="fd-user-name">{USER}</span>
          </div>
          <span title={online ? "Online - data synced" : "Connection lost - data may be stale"} style={{ width: 10, height: 10, borderRadius: "50%", background: online ? "var(--green)" : "var(--red)", display: "inline-block" }} />
          <button className="fd-logout-btn"><Icon name="logout" size={14} color="var(--gold-light)" /> Log out</button>
        </div>
      </header>

      <div className="fd-body-layout">
        {/* SIDEBAR */}
        <nav className="fd-sidebar">
          {allowedNav.map((item) => (
            <button key={item.key} className={`fd-sidebar-btn ${section === item.key ? "fd-sidebar-btn-active" : ""}`} onClick={() => go(item.key)}>
              <Icon name={item.icon} size={17} color={section === item.key ? "var(--gold-light)" : "var(--navy)"} />
              <span>{item.label}</span>
              {item.key === "notifications" && unreadCount > 0 && <span className="fd-sidebar-badge">{unreadCount}</span>}
              {item.key === "requests" && openRequests.length > 0 && <span className="fd-sidebar-badge">{openRequests.length}</span>}
            </button>
          ))}
        </nav>

        <main className="fd-main" onClick={() => { if (bellOpen || quickOpen) { setBellOpen(false); setQuickOpen(false); } }}>

          {/* ================= OVERVIEW ================= */}
          {section === "overview" && (
            <>
              <div style={S.statsRow}>
                <StatCard label="Total rooms" value={stats.total} accentVar="var(--navy)" onClick={() => go("rooms")} />
                <StatCard label="Occupied" value={stats.occupied} accentVar="var(--red)" onClick={() => { setRoomFilter({ status: "occupied", type: "All", floor: "All" }); go("rooms"); }} />
                <StatCard label="Vacant - ready" value={stats.vacant} accentVar="var(--green)" onClick={() => { setRoomFilter({ status: "available", type: "All", floor: "All" }); go("rooms"); }} />
                <StatCard label="Vacant - dirty" value={stats.dirty} accentVar="var(--amber)" onClick={() => { setRoomFilter({ status: "cleaning", type: "All", floor: "All" }); go("rooms"); }} />
                <StatCard label="Being cleaned" value={stats.cleaning} accentVar="var(--blue)" onClick={() => { setRoomFilter({ status: "cleaning", type: "All", floor: "All" }); go("rooms"); }} />
                <StatCard label="Reserved" value={stats.reserved} accentVar="var(--gold)" onClick={() => { setRoomFilter({ status: "reserved", type: "All", floor: "All" }); go("rooms"); }} />
                <StatCard label="Out of service" value={stats.outOfService} accentVar="var(--grey)" onClick={() => { setRoomFilter({ status: "outOfService", type: "All", floor: "All" }); go("rooms"); }} />
              </div>
              <div style={S.statsRow}>
                <StatCard label="Occupancy rate" value={stats.occupancy + "%"} accentVar="var(--red)" sub={`${stats.occupied} of ${stats.total - stats.outOfService} sellable rooms`} onClick={() => go("rooms")} />
                <StatCard label="Arrivals today" value={arrivalsAll.length} accentVar="var(--gold)" sub={`${arrivalsAll.length - arrivalsPending.length} checked in, ${arrivalsPending.length} expected`} onClick={() => { setArrDate(TODAY); go("arrivals"); }} />
                <StatCard label="Departures today" value={departuresAll.length} accentVar="var(--blue)" sub={`${departuresAll.length - departuresPending.length} left, ${departuresPending.length} to go`} onClick={() => { setArrDate(TODAY); go("arrivals"); }} />
                <StatCard label="Pending bookings" value={pendingBookings.length} accentVar="var(--amber)" onClick={() => { setStatusFilter("Pending"); go("records"); }} />
                <StatCard label="Overdue check-outs" value={overdue.length} accentVar="var(--red)" sub={`after ${CHECKOUT_HOUR}:00 AM`} onClick={() => go("arrivals")} />
                <StatCard label="In-house guests" value={inHouse.reduce((s, b) => s + b.guests, 0)} accentVar="var(--navy)" sub={`${inHouse.length} rooms`} onClick={() => go("inhouse")} />
                <StatCard label="Open requests" value={openRequests.length} accentVar="var(--amber)" onClick={() => go("requests")} />
              </div>
              {(
                <div style={S.statsRow}>
                  <StatCard label="Outstanding dues" value={money(outstanding)} accentVar="var(--red)" sub="in-house guests" onClick={() => { setIhDueOnly(true); go("inhouse"); }} />
                  <StatCard label="Collected today" value={money(paymentsToday)} accentVar="var(--green)" sub="advances and payments" onClick={() => go("reports")} />
                </div>
              )}

              <div className="fd-card" style={{ marginBottom: 0 }}>
                <SectionHeader eyebrow="Shortcuts" title="Quick actions" />
                <div style={S.row}>
                  {<button className="fd-btn-solid" onClick={() => { setD("source", "Phone"); go("booking"); }}>New booking</button>}
                  {<button className="fd-btn-outline" onClick={() => { setD("source", "Walk-in"); setD("checkIn", TODAY); go("booking"); }}>Walk-in check-in</button>}
                  <button className="fd-btn-outline" onClick={() => go("records")}>Search guest</button>
                  {<button className="fd-btn-outline" onClick={() => go("requests")}>Add service request</button>}
                  <button className="fd-btn-outline" onClick={() => setPaletteOpen(true)}>Command palette (Ctrl+K)</button>
                  <button className="fd-btn-outline" onClick={() => window.print()}><Icon name="print" size={14} color="var(--navy)" /> Print page</button>
                </div>
              </div>

              <div style={S.grid2}>
                <div className="fd-card">
                  <SectionHeader eyebrow="Inventory" title="Room status mix" />
                  <div className="fx-donut-wrap">
                    <Donut data={donutData} total={stats.total} centerValue={stats.occupancy + "%"} centerLabel="occupied" />
                    <div className="fx-donut-legend">
                      {donutData.map((d) => (
                        <div key={d.label}><span className="fx-dot" style={{ background: d.color }} />{d.label}: <b>{d.value}</b></div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="fd-card">
                  <SectionHeader eyebrow="Housekeeping" title="Rooms ready to sell" action={<span style={S.chip(readyPct >= 70 ? "var(--green)" : "var(--amber)")}>{readyPct}% ready</span>} />
                  <div className="fx-bar" style={{ marginBottom: 12 }}><span style={{ width: `${readyPct}%`, background: "var(--green)" }} /></div>
                                    {rooms.filter((r) => r.status === "cleaning").length === 0 && <div className="fd-empty-note">Every room is clean.</div>}
                  {rooms.filter((r) => r.status === "cleaning").map((r) => (
                    <div key={r.number} className="fd-list-row">
                      <div>
                        <div className="fd-list-name">Room {r.number} - {r.type}</div>
                        <div className="fd-list-sub">Floor {r.floor} - {roomLabel(r)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={S.grid2}>
                {renderArrivals(TODAY, "Today's arrivals")}
                {renderDepartures(TODAY, "Today's departures")}
              </div>

              <div style={S.grid2}>
                <div className="fd-card">
                  <SectionHeader eyebrow="At a glance" title="Room status" />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {rooms.map((r) => (
                      <button key={r.number} onClick={() => { setRoomPanel(r.number); go("rooms"); }} title={`Room ${r.number} - ${roomLabel(r)}`}
                        style={{ width: 46, height: 40, border: "none", borderRadius: 6, background: LEGEND_COLORS[r.status], color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        {r.number}
                      </button>
                    ))}
                  </div>
                  <div className="fd-legend" style={{ marginTop: 12 }}>
                    {Object.values(STATUS_META).map((s) => (
                      <span key={s.key} className="fd-legend-item"><span className="fd-legend-dot" style={{ background: LEGEND_COLORS[s.key] }} />{s.label}</span>
                    ))}
                  </div>
                </div>

                <div className="fd-card">
                  <SectionHeader eyebrow="Needs action" title="Pending bookings" />
                  {pendingBookings.length === 0 && <div className="fd-empty-note">No bookings are waiting for confirmation.</div>}
                  {pendingBookings.map((b) => (
                    <div key={b.id} className="fd-list-row">
                      <div>
                        <div className="fd-list-name">{b.name}</div>
                        <div className="fd-list-sub">{b.roomType} - {displayDate(b.checkIn)} to {displayDate(b.checkOut)} - {b.source}</div>
                      </div>
                      <div style={S.row}>
                        {<button className="fd-btn-checkin" onClick={() => setPickRoomFor(b)}>Confirm + assign</button>}
                        {<button className="fd-action-link fd-action-link-danger" onClick={() => cancelBooking(b.id)}>Reject</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={S.grid2}>
                <div className="fd-card">
                  <SectionHeader eyebrow="Guests" title="Service requests" action={<button className="fd-action-link" onClick={() => go("requests")}>Open all</button>} />
                  {openRequests.length === 0 && <div className="fd-empty-note">No open requests.</div>}
                  {openRequests.slice(0, 4).map(renderRequestRow)}
                </div>

                <div className="fd-card">
                  <SectionHeader eyebrow="Planning" title="7-day occupancy forecast" />
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 140 }}>
                    {forecast.map((f) => (
                      <div key={f.d} style={{ flex: 1, textAlign: "center" }} title={`${f.n} rooms booked`}>
                        <div style={S.muted}>{f.pct}%</div>
                        <div style={{ height: Math.max(f.pct, 3), background: f.pct > 80 ? "var(--red)" : "var(--navy)", borderRadius: "4px 4px 0 0" }} />
                        <div style={{ ...S.muted, marginTop: 4 }}>{new Date(f.d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric" })}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={S.grid2}>
                <div className="fd-card">
                  <SectionHeader eyebrow={`${shiftOf(now.getHours())} shift`} title="Shift notes and handover" />
                  {(
                    <form onSubmit={addNote} style={{ marginBottom: 12 }}>
                      <textarea className="fd-input" rows={2} placeholder="Leave a note for the next shift" value={noteDraft.text} onChange={(e) => setNoteDraft({ ...noteDraft, text: e.target.value })} style={{ width: "100%", marginBottom: 8 }} />
                      <div style={S.row}>
                        <select className="fd-select" style={{ width: 150 }} value={noteDraft.room} onChange={(e) => setNoteDraft({ ...noteDraft, room: e.target.value })}>
                          <option value="">No room tag</option>
                          {rooms.map((r) => <option key={r.number} value={r.number}>Room {r.number}</option>)}
                        </select>
                        <button type="submit" className="fd-btn-solid">Add note</button>
                      </div>
                    </form>
                  )}
                  {notes.slice(0, 4).map((n) => (
                    <div key={n.id} className="fd-list-row">
                      <div>
                        <div className="fd-list-name">{n.text}</div>
                        <div className="fd-list-sub">{n.author} - {n.shift} - {ago(n.ts)}{n.room ? ` - Room ${n.room}` : ""}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="fd-card">
                  <SectionHeader eyebrow="Audit trail" title="Recent activity" />
                  {audit.slice(0, 6).map((a) => (
                    <div key={a.id} className="fd-notification-row">
                      <div className="fd-notification-dot" />
                      <div style={{ flex: 1 }}>
                        <div className="fd-notification-text">{a.text}</div>
                        <div className="fd-notification-time">{a.user} - {ago(a.ts)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ================= NEW BOOKING ================= */}
          {section === "booking" && (
            <div className="fx-booking-grid">
              <div className="fd-card">
                <SectionHeader eyebrow="Front desk" title="New guest booking" />
                <form onSubmit={handleBookingSubmit}>
                  <div className="fd-form-row-2">
                    <div>
                      <label className="fd-label">Contact number *</label>
                      <input className="fd-input" placeholder="10-digit mobile" value={draft.phone} onChange={(e) => setD("phone", e.target.value.replace(/\D/g, "").slice(0, 10))} />
                      {formErrors.phone && <div className="fd-error">{formErrors.phone}</div>}
                    </div>
                    <div>
                      <label className="fd-label">Booking source</label>
                      <select className="fd-select" value={draft.source} onChange={(e) => setD("source", e.target.value)}>
                        <option>Walk-in</option><option>Phone</option><option>Online</option><option>Agent</option>
                      </select>
                    </div>
                  </div>
                  {matchedGuest && (
                    <div className="fd-suggested-note">
                      Returning guest: <b>{matchedGuest.name}</b> ({bookings.filter((b) => b.phone === matchedGuest.phone).length} stay(s) on record).{" "}
                      {matchedMeta.vip && <b>VIP. </b>}
                      {matchedMeta.notes && <>Preferences: {matchedMeta.notes}. </>}
                      <button type="button" className="fd-action-link" onClick={() => setDraft((d) => ({ ...d, name: matchedGuest.name, idType: matchedGuest.idType, idNumber: matchedGuest.idNumber, email: matchedGuest.email || "" }))}>Use saved details</button>
                    </div>
                  )}
                  {overlapStay && (
                    <div className="fd-suggested-note" style={{ color: "var(--red)" }}>
                      This guest already has booking <b>{overlapStay.id}</b> ({displayDate(overlapStay.checkIn)} to {displayDate(overlapStay.checkOut)}) that overlaps these dates. Check it is not a duplicate.
                    </div>
                  )}
                  <div className="fd-form-group">
                    <label className="fd-label">Guest name *</label>
                    <input className="fd-input" placeholder="e.g. Rohan Das" value={draft.name} onChange={(e) => setD("name", e.target.value)} />
                    {formErrors.name && <div className="fd-error">{formErrors.name}</div>}
                  </div>
                  <div className="fd-form-row-2">
                    <div>
                      <label className="fd-label">Email</label>
                      <input className="fd-input" placeholder="optional" value={draft.email} onChange={(e) => setD("email", e.target.value)} />
                      {formErrors.email && <div className="fd-error">{formErrors.email}</div>}
                    </div>
                    <div>
                      <label className="fd-label">Purpose of stay *</label>
                      <select className="fd-select" value={draft.purpose} onChange={(e) => setD("purpose", e.target.value)}>
                        <option>Leisure</option><option>Business</option><option>Family</option><option>Event</option><option>Medical</option><option>Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="fd-form-row-2">
                    <div>
                      <label className="fd-label">ID proof type *</label>
                      <select className="fd-select" value={draft.idType} onChange={(e) => setD("idType", e.target.value)}>
                        <option>Aadhaar</option><option>Passport</option><option>Driving Licence</option><option>Voter ID</option>
                      </select>
                    </div>
                    <div>
                      <label className="fd-label">ID number *</label>
                      <input className="fd-input" placeholder="ID number" value={draft.idNumber} onChange={(e) => setD("idNumber", e.target.value)} />
                      {formErrors.idNumber && <div className="fd-error">{formErrors.idNumber}</div>}
                    </div>
                  </div>

                  <div className="fd-form-row-3">
                    <div>
                      <label className="fd-label">Check-in date *</label>
                      <input type="date" min={TODAY} className="fd-input" value={draft.checkIn} onChange={(e) => setD("checkIn", e.target.value)} />
                      {formErrors.checkIn && <div className="fd-error">{formErrors.checkIn}</div>}
                    </div>
                    <div>
                      <label className="fd-label">Nights *</label>
                      <input type="number" min="1" className="fd-input" value={draft.duration} onChange={(e) => setD("duration", e.target.value)} />
                      {formErrors.duration && <div className="fd-error">{formErrors.duration}</div>}
                    </div>
                    <div>
                      <label className="fd-label">Guests * (max {CAP[draft.roomType]})</label>
                      <input type="number" min="1" className="fd-input" value={draft.guests} onChange={(e) => setD("guests", e.target.value)} />
                      {formErrors.guests && <div className="fd-error">{formErrors.guests}</div>}
                    </div>
                  </div>

                  <div className="fd-form-row-2">
                    <div>
                      <label className="fd-label">Room type</label>
                      <select className="fd-select" value={draft.roomType} onChange={(e) => setD("roomType", e.target.value)}>
                        {Object.keys(RATES).map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="fd-label">Specific room (optional)</label>
                      <select className="fd-select" value={draft.preferredRoom} onChange={(e) => setD("preferredRoom", e.target.value)}>
                        <option value="">Assign later</option>
                        {availableForDraft.map((r) => <option key={r.number} value={r.number}>Room {r.number} (Floor {r.floor})</option>)}
                      </select>
                      {formErrors.preferredRoom && <div className="fd-error">{formErrors.preferredRoom}</div>}
                    </div>
                  </div>
                  <div className="fd-suggested-note">
                    {availableForDraft.length > 0
                      ? <><b>{availableForDraft.length}</b> {draft.roomType} room(s) free for {displayDate(draft.checkIn || TODAY)} to {displayDate(draftCheckOut)}.</>
                      : <>No {draft.roomType} rooms are free for these dates. Try another type or date.</>}
                  </div>

                  <div className="fd-form-row-2">
                    <div>
                      <label className="fd-label">Meal plan (per guest, per night)</label>
                      <select className="fd-select" value={draft.meal} onChange={(e) => setD("meal", e.target.value)}>
                        {Object.entries(MEALS).map(([k, v]) => <option key={k} value={k}>{k}{v ? ` (+${money(v)})` : ""}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="fd-label">Payment mode</label>
                      <select className="fd-select" value={draft.payMode} onChange={(e) => setD("payMode", e.target.value)}>
                        {PAY_MODES.map((m) => <option key={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="fd-form-row-2">
                    <div>
                      <label className="fd-label">Advance paid (Rs)</label>
                      <input type="number" min="0" className="fd-input" value={draft.advance} onChange={(e) => setD("advance", e.target.value)} />
                      {formErrors.advance && <div className="fd-error">{formErrors.advance}</div>}
                    </div>
                    <div>
                      <label className="fd-label">Special requests</label>
                      <input className="fd-input" placeholder="e.g. ground floor, extra bed" value={draft.requests} onChange={(e) => setD("requests", e.target.value)} />
                    </div>
                  </div>

                  <button type="submit" className="fd-submit-btn"><Icon name="plus" size={16} color="#fff" /> Create booking</button>
                  <div style={{ marginTop: 8 }}>
                    <button type="button" className="fd-action-link" onClick={() => { setDraft(emptyDraft); setFormErrors({}); }}>Clear form</button>
                  </div>
                  {formOk && <div className="fd-success-msg"><Icon name="check" size={14} color="var(--green)" /> Booking created.</div>}
                </form>
              </div>

              <div className="fd-card fx-summary">
                <SectionHeader eyebrow="Live estimate" title="Price summary" />
                <div className="fx-sum-row"><span>{draft.roomType} x {nightsDraft} night(s)</span><span>{money(roomBase)}</span></div>
                <div className="fx-sum-row"><span>{draft.meal}{mealPN ? ` (${draft.guests} guest(s))` : ""}</span><span>{money(mealBase)}</span></div>
                <div className="fx-sum-row"><span>Subtotal</span><span>{money(subtotal)}</span></div>
                <div className="fx-sum-row"><span>GST 12%</span><span>{money(gstAmt)}</span></div>
                <div className="fx-sum-row total"><span>Total</span><span>{money(draftTotal)}</span></div>
                <div className="fx-sum-row"><span>Advance ({draft.payMode})</span><span>{money(Number(draft.advance) || 0)}</span></div>
                <div className="fx-sum-row total"><span>Balance at check-in</span><span style={{ color: draftBalance ? "var(--red)" : "var(--green)" }}>{money(draftBalance)}</span></div>
                <div style={{ ...S.muted, marginTop: 10 }}>
                  Check-in from {CHECKIN_HOUR}:00, check-out by {CHECKOUT_HOUR}:00 AM on {displayDate(draftCheckOut)}.
                </div>
                <div style={{ ...S.muted, marginTop: 6 }}>Rates per night: {Object.entries(RATES).map(([k, v]) => `${k} ${money(v)}`).join(", ")}.</div>
              </div>
            </div>
          )}

          {/* ================= ROOM BOARD ================= */}
          {section === "rooms" && (
            <div className="fd-card">
              <SectionHeader
                eyebrow="Live status" title="Room allocation board"
                action={
                  <div className="fd-legend">
                    {Object.values(STATUS_META).map((s) => (
                      <span key={s.key} className="fd-legend-item"><span className="fd-legend-dot" style={{ background: LEGEND_COLORS[s.key] }} />{s.label}</span>
                    ))}
                  </div>
                }
              />
              <div className="fx-tool">
                <input className="fd-input" style={{ width: 190 }} placeholder="Room or guest name" value={roomQuery} onChange={(e) => setRoomQuery(e.target.value)} />
                <select className="fd-select" style={{ width: 160 }} value={roomFilter.status} onChange={(e) => setRoomFilter({ ...roomFilter, status: e.target.value })}>
                  <option value="All">All statuses</option>
                  {Object.values(STATUS_META).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <select className="fd-select" style={{ width: 140 }} value={roomFilter.type} onChange={(e) => setRoomFilter({ ...roomFilter, type: e.target.value })}>
                  <option value="All">All types</option>
                  {Object.keys(RATES).map((t) => <option key={t}>{t}</option>)}
                </select>
                <select className="fd-select" style={{ width: 130 }} value={roomFilter.floor} onChange={(e) => setRoomFilter({ ...roomFilter, floor: e.target.value })}>
                  <option value="All">All floors</option>
                  {[1, 2, 3, 4].map((f) => <option key={f} value={String(f)}>Floor {f}</option>)}
                </select>
                <button className="fd-action-link" onClick={() => { setRoomFilter({ status: "All", type: "All", floor: "All" }); setRoomQuery(""); }}>Clear filters</button>
                <div className="fd-filter-row" style={{ marginLeft: "auto" }}>
                  {[["grid", "Grid"], ["list", "List"]].map(([k, l]) => (
                    <button key={k} className={`fd-filter-btn ${roomView === k ? "fd-filter-btn-active" : ""}`} onClick={() => setRoomView(k)}>{l}</button>
                  ))}
                </div>
              </div>

              {filteredRooms.length === 0 && <div className="fd-empty-note">No rooms match these filters.</div>}

              {roomView === "grid" && Object.entries(roomsByFloor).map(([floor, list]) => (
                <div key={floor} className="fd-floor-block">
                  <div className="fd-floor-label">Floor {floor}</div>
                  <div className="fd-room-grid">
                    {list.map((r) => {
                      const guest = guestByRoom[r.number];
                      return (
                        <button key={r.number} onClick={() => setRoomPanel(r.number)} title={`Room ${r.number} - ${roomLabel(r)}`} className={`fd-room-tile status-${r.status}`} style={{ cursor: "pointer" }}>
                          <div className="fd-room-tile-hole" />
                          <div className="fd-room-number">{r.number}</div>
                          <div className="fd-room-type">{r.type}</div>
                          <div className="fd-room-status-label">{roomLabel(r)}</div>
                          {guest && <div className="fd-room-type">{guest.name.split(" ")[0]} - out {displayDate(guest.checkOut).slice(0, 6)}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {roomView === "list" && filteredRooms.length > 0 && (
                <div className="fd-table-wrap">
                  <table className="fd-table">
                    <thead><tr><th>Room</th><th>Type</th><th>Floor</th><th>Status</th><th>Guest</th><th>Rate</th><th>Action</th></tr></thead>
                    <tbody>
                      {filteredRooms.map((r) => {
                        const guest = guestByRoom[r.number];
                        return (
                          <tr key={r.number}>
                            <td className="fd-booking-id">{r.number}</td>
                            <td>{r.type}</td>
                            <td>{r.floor}</td>
                            <td><span style={S.chip(LEGEND_COLORS[r.status])}>{roomLabel(r)}</span></td>
                            <td>{guest ? `${guest.name} (out ${displayDate(guest.checkOut).slice(0, 6)})` : r.note || "-"}</td>
                            <td>{money(RATES[r.type])}</td>
                            <td><button className="fd-action-link" onClick={() => setRoomPanel(r.number)}>Open</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ================= ARRIVALS & DEPARTURES ================= */}
          {section === "arrivals" && (
            <>
              <div className="fx-tool no-print">
                <div className="fd-filter-row" style={{ margin: 0 }}>
                  {[["Today", TODAY], ["Tomorrow", fmtDate(1)]].map(([l, d]) => (
                    <button key={l} className={`fd-filter-btn ${arrDate === d ? "fd-filter-btn-active" : ""}`} onClick={() => setArrDate(d)}>{l}</button>
                  ))}
                </div>
                <input type="date" className="fd-input" style={{ width: 160 }} value={arrDate} onChange={(e) => e.target.value && setArrDate(e.target.value)} />
                <input className="fd-input" style={{ width: 210 }} placeholder="Filter by guest, phone, room" value={arrQuery} onChange={(e) => setArrQuery(e.target.value)} />
                <select className="fd-select" style={{ width: 150 }} value={arrSort} onChange={(e) => setArrSort(e.target.value)}>
                  <option value="eta">Sort by arrival time</option>
                  <option value="name">Sort by name</option>
                  <option value="room">Sort by room</option>
                </select>
                <button className="fd-btn-outline" onClick={() => window.print()}><Icon name="print" size={14} color="var(--navy)" /> Print list</button>
              </div>
              <div className="fd-arr-dep-grid">
                {renderArrivals(arrDate, "Arrivals", true)}
                {renderDepartures(arrDate, "Departures", true)}
              </div>
            </>
          )}

          {/* ================= IN-HOUSE GUESTS ================= */}
          {section === "inhouse" && (
            <div className="fd-card">
              <SectionHeader eyebrow="Currently staying" title="In-house guests" />
              <div className="fx-tool no-print">
                <input className="fd-input" style={{ width: 210 }} placeholder="Search guest, phone, room" value={ihQuery} onChange={(e) => setIhQuery(e.target.value)} />
                <select className="fd-select" style={{ width: 130 }} value={ihFloor} onChange={(e) => setIhFloor(e.target.value)}>
                  <option value="All">All floors</option>
                  {[1, 2, 3, 4].map((f) => <option key={f} value={String(f)}>Floor {f}</option>)}
                </select>
                <label style={{ ...S.row, fontSize: 13 }}><input type="checkbox" checked={ihDueOnly} onChange={(e) => setIhDueOnly(e.target.checked)} /> Unpaid balance only</label>
                <button className="fd-action-link" onClick={() => { setIhQuery(""); setIhFloor("All"); setIhDueOnly(false); }}>Clear</button>
              </div>
              {inHouseList.length === 0 && <div className="fd-empty-note">{inHouse.length ? "No guests match these filters." : "No guests are checked in right now."}</div>}
              {inHouseList.length > 0 && (
                <>
                  <div className="fd-table-wrap">
                    <table className="fd-table">
                      <thead><tr><th>Room</th><th>Guest</th><th>Stay</th><th>Contact</th><th>Bill</th><th>Requests</th><th>Actions</th></tr></thead>
                      <tbody>
                        {inHouseList.map((b) => (
                          <tr key={b.id}>
                            <td className="fd-booking-id">{b.room}</td>
                            <td><div className="fd-guest-name">{b.name}</div><div className="fd-guest-phone">{b.guests} guest(s){b.meal && b.meal !== "No meals" ? ` - ${b.meal}` : ""}</div></td>
                            <td className="fd-nowrap">
                              {displayDate(b.checkIn)} to {displayDate(b.checkOut)}
                              <div className="fx-bar" style={{ marginTop: 5 }} title={`${stayPct(b)}% of stay completed`}><span style={{ width: `${stayPct(b)}%`, background: "var(--navy)" }} /></div>
                            </td>
                            <td>{b.phone}</td>
                            <td>{billChip(b)}</td>
                            <td>{requests.filter((r) => r.room === b.room && r.status !== "Done").length}</td>
                            <td>
                              <div style={S.row}>
                                {<button className="fd-action-link" onClick={() => setFolioId(b.id)}>Folio</button>}
                                {<button className="fd-action-link" onClick={() => extendStay(b)}>Extend</button>}
                                {<button className="fd-action-link" onClick={() => setMoveBooking(b)}>Move</button>}
                                {<button className="fd-action-link" onClick={() => { setReqDraft({ ...reqDraft, room: b.room }); go("requests"); }}>Add request</button>}
                                {<button className="fd-btn-checkout" onClick={() => setCheckOutBooking(b)}>Check out</button>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ ...S.muted, marginTop: 12 }}>
                    {inHouseList.length} room(s) - {inHouseList.reduce((s, b) => s + b.guests, 0)} guest(s) - outstanding {money(inHouseList.reduce((s, b) => s + dueOf(b), 0))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ================= SERVICE REQUESTS ================= */}
          {section === "requests" && (
            <div style={S.grid2}>
              {(
                <div className="fd-card">
                  <SectionHeader eyebrow="Front desk" title="New service request" />
                  <form onSubmit={addRequest}>
                    <div className="fd-form-row-2">
                      <div>
                        <label className="fd-label">Room</label>
                        <select className="fd-select" value={reqDraft.room} onChange={(e) => setReqDraft({ ...reqDraft, room: e.target.value })}>
                          <option value="">Select occupied room</option>
                          {rooms.filter((r) => r.status === "occupied").map((r) => <option key={r.number} value={r.number}>Room {r.number}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="fd-label">Priority</label>
                        <select className="fd-select" value={reqDraft.priority} onChange={(e) => setReqDraft({ ...reqDraft, priority: e.target.value })}>
                          <option>Low</option><option>Normal</option><option>High</option>
                        </select>
                      </div>
                    </div>
                    <div className="fd-form-group">
                      <label className="fd-label">Request type</label>
                      <select className="fd-select" value={reqDraft.type} onChange={(e) => setReqDraft({ ...reqDraft, type: e.target.value })}>
                        {["Extra towels", "Room cleaning", "Wake-up call", "Extra bed", "Laundry", "Taxi", "Maintenance", "Late check-out"].map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="fd-form-group">
                      <label className="fd-label">Details</label>
                      <input className="fd-input" value={reqDraft.desc} onChange={(e) => setReqDraft({ ...reqDraft, desc: e.target.value })} placeholder="Optional" />
                    </div>
                    <button type="submit" className="fd-submit-btn"><Icon name="plus" size={16} color="#fff" /> Create request</button>
                  </form>
                </div>
              )}
              <div className="fd-card">
                <SectionHeader eyebrow="Live" title={`Requests (${openRequests.length} open)`} />
                {requests.length === 0 && <div className="fd-empty-note">No requests yet.</div>}
                {requests.map(renderRequestRow)}
              </div>
            </div>
          )}

          {/* ================= NOTIFICATIONS ================= */}
          {section === "notifications" && (
            <div className="fd-card">
              <SectionHeader
                eyebrow="Live" title="Notifications"
                action={<div style={S.row}><button className="fd-action-link" onClick={clearRead}>Clear read</button><button className="fd-action-link" onClick={markAllRead}>Mark all as read</button></div>}
              />
              <div className="fx-tool" style={{ marginBottom: 12 }}>
                <div className="fd-filter-row" style={{ margin: 0 }}>
                  {[["All", "All"], ["Unread", `Unread (${unreadCount})`], ["booking", "Bookings"], ["rooms", "Rooms"], ["requests", "Requests"]].map(([k, l]) => (
                    <button key={k} className={`fd-filter-btn ${notifFilter === k ? "fd-filter-btn-active" : ""}`} onClick={() => setNotifFilter(k)}>{l}</button>
                  ))}
                </div>
                <select className="fd-select" style={{ width: 150 }} value={notifPrio} onChange={(e) => setNotifPrio(e.target.value)}>
                  <option value="All">All priorities</option>
                  <option>Urgent</option><option>Warning</option><option>Info</option>
                </select>
              </div>
              {(() => {
                const list = allNotifs.filter((n) =>
                  (notifFilter === "All" ? true : notifFilter === "Unread" ? !n.read : n.type === notifFilter) &&
                  (notifPrio === "All" || n.priority === notifPrio));
                if (list.length === 0) return <div className="fd-empty-note">You're all caught up.</div>;
                return list.map((n) => (
                  <div key={n.id} className="fd-notification-row" style={{ opacity: n.read ? 0.65 : 1 }}>
                    <div className="fd-notification-dot" />
                    <div style={{ flex: 1 }}>
                      <div className="fd-notification-text"><span style={S.chip(PRIORITY_COLOR[n.priority])}>{n.priority}</span> {n.text}</div>
                      <div className="fd-notification-time">{n.live ? "Live alert - clears when resolved" : ago(n.ts)}</div>
                    </div>
                    {!n.live && !n.read && <button className="fd-action-link" onClick={() => markRead(n.id)}>Mark read</button>}
                    <button className="fd-action-link" onClick={() => { if (!n.live) markRead(n.id); go(n.link); }}>Open</button>
                    {!n.live && (
                      <button className="fd-notification-close" onClick={() => setNotifications((p) => p.filter((x) => x.id !== n.id))}>
                        <Icon name="close" size={13} color="var(--charcoal-soft)" />
                      </button>
                    )}
                  </div>
                ));
              })()}
            </div>
          )}

          {/* ================= GUEST RECORDS ================= */}
          {section === "records" && (
            <div className="fd-card">
              <SectionHeader
                eyebrow="Records" title="Guest search and booking status"
                action={
                  <div className="fd-search-wrap">
                    <div className="fd-search-icon"><Icon name="search" size={15} color="var(--charcoal-soft)" /></div>
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone, booking ID, ID number or room" className="fd-input fd-search-input" />
                  </div>
                }
              />
              <div className="fd-filter-row">
                {[["bookings", "Bookings"], ["guests", "Guests"]].map(([k, l]) => (
                  <button key={k} onClick={() => setRecordsTab(k)} className={`fd-filter-btn ${recordsTab === k ? "fd-filter-btn-active" : ""}`}>{l}</button>
                ))}
              </div>

              {recordsTab === "bookings" && (
                <>
                  <div className="fd-filter-row">
                    {["All", "Pending", "Confirmed", "Checked-In", "Checked-Out", "Cancelled", "No-show"].map((s) => (
                      <button key={s} onClick={() => setStatusFilter(s)} className={`fd-filter-btn ${statusFilter === s ? "fd-filter-btn-active" : ""}`}>{s}</button>
                    ))}
                  </div>
                  <div className="fd-table-wrap">
                    <table className="fd-table">
                      <thead><tr>{["Booking ID", "Guest", "Room", "Status", "Check-in", "Check-out", "Bill", "Actions"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                      <tbody>
                        {filteredBookings.length === 0 && <tr><td colSpan={8} className="fd-table-empty">No bookings match this search. Clear the filters or check the spelling.</td></tr>}
                        {filteredBookings.map((b) => (
                          <tr key={b.id}>
                            <td className="fd-booking-id">{b.id}</td>
                            <td>
                              <div className="fd-guest-name"><button className="fd-action-link" onClick={() => setGuestPhone(b.phone)}>{b.name}</button>{guestMeta[b.phone]?.vip && <span style={{ ...S.chip("var(--gold)"), marginLeft: 6 }}>VIP</span>}</div>
                              <div className="fd-guest-phone">{b.phone}</div>
                            </td>
                            <td>{b.room || "-"}</td>
                            <td><span className={`fd-status-pill badge-${b.status}`}>{b.status}</span></td>
                            <td className="fd-nowrap">{displayDate(b.checkIn)}</td>
                            <td className="fd-nowrap">{displayDate(b.checkOut)}</td>
                            <td>{billChip(b)}</td>
                            <td>
                              <div className="fd-action-row">
                                {b.status === "Checked-In" && <button className="fd-action-link" onClick={() => setPassBooking(b)}>View pass</button>}
                                {(b.status === "Pending" || b.status === "Confirmed") && <button className="fd-action-link fd-action-link-danger" onClick={() => cancelBooking(b.id)}>Cancel</button>}
                                {["Checked-In", "Checked-Out", "Confirmed"].includes(b.status) && <button className="fd-action-link" onClick={() => setFolioId(b.id)}>Folio</button>}
                                <button className="fd-action-link" onClick={() => setHistoryRef(b.id)}>History</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {recordsTab === "guests" && (
                <div className="fd-table-wrap">
                  <table className="fd-table">
                    <thead><tr>{["Guest", "Phone", "ID proof", "Stays", "Last visit", "Total spend", "Flags"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>
                      {guests.length === 0 && <tr><td colSpan={7} className="fd-table-empty">No guests match this search.</td></tr>}
                      {guests.map((g) => {
                        const m = guestMeta[g.phone] || {};
                        const last = g.stays.map((s) => s.checkIn).sort().pop();
                        return (
                          <tr key={g.phone}>
                            <td><button className="fd-action-link" onClick={() => setGuestPhone(g.phone)}>{g.name}</button></td>
                            <td>{g.phone}</td>
                            <td>{g.idType} {maskId(g.idNumber)}</td>
                            <td>{g.stays.length}</td>
                            <td className="fd-nowrap">{displayDate(last)}</td>
                            <td>{money(g.stays.reduce((s, b) => s + b.paid, 0))}</td>
                            <td>
                              {m.vip && <span style={S.chip("var(--gold)")}>VIP</span>}{" "}
                                                            {g.stays.length > 1 && <span style={S.chip("var(--blue)")}>Returning</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ================= REPORTS ================= */}
          {section === "reports" && (
            <div className="fd-card">
              <SectionHeader
                eyebrow={`${shiftOf(now.getHours())} shift - ${displayDate(TODAY)}`} title="Shift summary"
                action={<div style={S.row}><button className="fd-btn-outline" onClick={() => window.print()}><Icon name="print" size={14} color="var(--navy)" /> Print</button></div>}
              />
              <div style={S.statsRow}>
                <StatCard label="New bookings" value={countKind("booking")} accentVar="var(--navy)" />
                <StatCard label="Check-ins" value={countKind("checkin")} accentVar="var(--green)" />
                <StatCard label="Check-outs" value={countKind("checkout")} accentVar="var(--blue)" />
                <StatCard label="Room moves" value={countKind("move")} accentVar="var(--gold)" />
                <StatCard label="Cancellations" value={countKind("cancel")} accentVar="var(--red)" />
                <StatCard label="No-shows" value={countKind("noshow")} accentVar="var(--amber)" />
                <StatCard label="Payments collected" value={money(paymentsToday)} accentVar="var(--gold)" />
              </div>
              <h3 className="fd-modal-title" style={{ margin: "14px 0 10px" }}>Shift notes</h3>
              {notes.length === 0 && <div className="fd-empty-note">No notes were logged.</div>}
              {notes.map((n) => <div key={n.id} className="fd-list-row"><div><div className="fd-list-name">{n.text}</div><div className="fd-list-sub">{n.author} - {n.shift} - {ago(n.ts)}</div></div></div>)}
              <h3 className="fd-modal-title" style={{ margin: "14px 0 10px" }}>Today's activity log</h3>
              {todaysAudit.length === 0 && <div className="fd-empty-note">No activity logged today.</div>}
              {todaysAudit.map((a) => <div key={a.id} className="fd-notification-row"><div className="fd-notification-dot" /><div><div className="fd-notification-text">{a.text}</div><div className="fd-notification-time">{a.user} - {ago(a.ts)}</div></div></div>)}
            </div>
          )}
        </main>
      </div>

      {/* ================= MODALS ================= */}

      {/* COMMAND PALETTE */}
      {paletteOpen && (
        <Modal onClose={() => setPaletteOpen(false)} width={520}>
          <div className="fd-modal-inner">
            <input
              autoFocus className="fd-input" style={{ width: "100%", marginBottom: 10 }}
              placeholder="Type a page, action, guest name or booking ID"
              value={palQuery}
              onChange={(e) => { setPalQuery(e.target.value); setPalIdx(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setPalIdx((i) => Math.min(i + 1, paletteItems.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setPalIdx((i) => Math.max(i - 1, 0)); }
                if (e.key === "Enter") { e.preventDefault(); runPalette(paletteItems[palIdx]); }
              }}
            />
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {paletteItems.length === 0 && <div className="fd-modal-empty">Nothing matches. Try a guest name or page.</div>}
              {paletteItems.map((it, i) => (
                <button key={it.label} className={`fx-pal-item ${i === palIdx ? "active" : ""}`} onMouseEnter={() => setPalIdx(i)} onClick={() => runPalette(it)}>{it.label}</button>
              ))}
            </div>
            <div style={{ ...S.muted, marginTop: 8 }}>Arrow keys to move, Enter to run, Esc to close.</div>
          </div>
        </Modal>
      )}

      {/* ROOM PANEL */}
      {roomPanelRoom && (() => {
        const r = roomPanelRoom;
        const cur = bookings.find((b) => b.room === r.number && b.status === "Checked-In");
        const upcoming = bookings.filter((b) => b.room === r.number && ["Pending", "Confirmed"].includes(b.status));
        const assignable = bookings.filter((b) => !b.room && ["Pending", "Confirmed"].includes(b.status) && roomFree(bookings, r.number, b.checkIn, b.checkOut, b.id) && (b.checkIn !== TODAY || r.status === "available"));
        const roomReqs = requests.filter((q) => q.room === r.number && q.status !== "Done");
        return (
          <Modal onClose={() => setRoomPanel(null)}>
            <div className="fd-modal-inner">
              <ModalTitle title={`Room ${r.number}`} sub={`${r.type} - Floor ${r.floor} - ${money(RATES[r.type])} per night - ${roomLabel(r)}`} onClose={() => setRoomPanel(null)} />
              {r.note && <div className="fd-suggested-note">{r.note}</div>}
              {cur && <div className="fd-list-row"><div><div className="fd-list-name">Current guest: {cur.name}</div><div className="fd-list-sub">{displayDate(cur.checkIn)} to {displayDate(cur.checkOut)} - {cur.phone} - {dueOf(cur) > 0 ? `${money(dueOf(cur))} due` : "paid"}</div></div></div>}
              {upcoming.map((b) => <div key={b.id} className="fd-list-row"><div><div className="fd-list-name">Reserved: {b.name}</div><div className="fd-list-sub">{displayDate(b.checkIn)} to {displayDate(b.checkOut)}</div></div></div>)}
              {roomReqs.map((q) => <div key={q.id} className="fd-list-row"><div><div className="fd-list-name">Request: {q.type}</div><div className="fd-list-sub">{q.status} - {ago(q.ts)}</div></div></div>)}
              {!cur && upcoming.length === 0 && <div className="fd-empty-note">No guest is assigned to this room.</div>}

              <div style={{ ...S.row, margin: "12px 0" }}>
                {r.status === "cleaning" && r.hk !== "dirty" && (
                  <button className="fd-btn-solid" onClick={() => advanceHousekeeping(r)}>Confirm clean and ready</button>
                )}
                {cur && <button className="fd-btn-checkout" onClick={() => { setRoomPanel(null); setCheckOutBooking(cur); }}>Check out</button>}
                {cur && <button className="fd-btn-outline" onClick={() => { setRoomPanel(null); setFolioId(cur.id); }}>Folio</button>}
                {cur && <button className="fd-btn-outline" onClick={() => { setRoomPanel(null); setMoveBooking(cur); }}>Move guest</button>}
                {(r.status === "available" || r.status === "outOfService") && (
                  <button className="fd-btn-outline" onClick={() => toggleBlock(r)}>{r.status === "outOfService" ? "Return to service" : "Block room"}</button>
                )}
              </div>

              {r.status !== "outOfService" && (
                <>
                  <div className="fd-label" style={{ marginBottom: 6 }}>Assign an unallocated booking</div>
                  {assignable.length === 0 && <div className="fd-modal-empty">No unassigned bookings fit this room. Create a new booking first.</div>}
                  {assignable.map((b) => (
                    <div key={b.id} className="fd-assign-row">
                      <div><div className="fd-assign-name">{b.name}</div><div className="fd-assign-sub">{b.roomType} preferred - {displayDate(b.checkIn)} to {displayDate(b.checkOut)}</div></div>
                      <button className="fd-assign-btn" onClick={() => { if (assignRoomToBooking(b.id, r.number)) setRoomPanel(null); }}>Assign</button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </Modal>
        );
      })()}

      {pickRoomFor && (
        <Modal onClose={() => setPickRoomFor(null)}>
          <div className="fd-modal-inner">
            <ModalTitle title={`Assign a room to ${pickRoomFor.name}`} sub={`${pickRoomFor.roomType} preferred - ${displayDate(pickRoomFor.checkIn)} to ${displayDate(pickRoomFor.checkOut)}`} onClose={() => setPickRoomFor(null)} />
            {pickCandidates.length === 0 && <div className="fd-modal-empty">No rooms are free for these dates.</div>}
            {pickCandidates.map((r) => (
              <div key={r.number} className="fd-assign-row">
                <div><div className="fd-assign-name">Room {r.number} - {r.type}</div><div className="fd-assign-sub">Floor {r.floor} - {roomLabel(r)}{r.type === pickRoomFor.roomType ? " - matches preference" : ""}</div></div>
                <button className="fd-assign-btn" onClick={() => { if (assignRoomToBooking(pickRoomFor.id, r.number)) setPickRoomFor(null); }}>Assign</button>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {checkInBooking && <CheckInModal booking={checkInBooking} rooms={rooms} candidates={checkInCandidates} onClose={() => setCheckInBooking(null)} onConfirm={handleCheckInConfirm} />}
      {checkOutBooking && <CheckOutModal booking={checkOutBooking} onClose={() => setCheckOutBooking(null)} onConfirm={handleCheckOutConfirm} />}
      {moveBooking && <MoveRoomModal booking={moveBooking} candidates={moveCandidates} onClose={() => setMoveBooking(null)} onConfirm={handleRoomMove} />}
      {folioBooking && (
        <FolioModal
          booking={folioBooking} onClose={() => setFolioId(null)}
          onCharge={addCharge} onPay={addPayment} onInvoice={downloadInvoice}
          canCharge canPay
        />
      )}

      {historyRef && (
        <Modal onClose={() => setHistoryRef(null)}>
          <div className="fd-modal-inner">
            <ModalTitle title={`History - ${historyRef}`} sub="Who did what, and when" onClose={() => setHistoryRef(null)} />
            {audit.filter((a) => a.ref === historyRef).length === 0 && <div className="fd-modal-empty">No recorded actions for this booking yet.</div>}
            {audit.filter((a) => a.ref === historyRef).map((a) => (
              <div key={a.id} className="fd-notification-row"><div className="fd-notification-dot" /><div><div className="fd-notification-text">{a.text}</div><div className="fd-notification-time">{a.user} - {new Date(a.ts).toLocaleString("en-IN")}</div></div></div>
            ))}
          </div>
        </Modal>
      )}

      {guestProfile && (() => {
        const m = guestMeta[guestProfile.phone] || {};
        const setM = (patch) => setGuestMeta((p) => ({ ...p, [guestProfile.phone]: { ...m, ...patch } }));
        return (
          <Modal onClose={() => setGuestPhone(null)} width={540}>
            <div className="fd-modal-inner">
              <ModalTitle title={guestProfile.name} sub={`${guestProfile.phone}${guestProfile.email ? " - " + guestProfile.email : ""} - ${guestProfile.idType} ${maskId(guestProfile.idNumber)}`} onClose={() => setGuestPhone(null)} />
              <div style={{ ...S.row, marginBottom: 10 }}>
                {<label style={{ ...S.row, fontSize: 13 }}><input type="checkbox" checked={!!m.vip} onChange={(e) => setM({ vip: e.target.checked })} /> VIP guest</label>}
              </div>
              <label className="fd-label">Preferences and notes</label>
              <textarea className="fd-input" rows={2} style={{ width: "100%", marginBottom: 12 }} placeholder="e.g. prefers ground floor, allergic to feathers" value={m.notes || ""} onChange={(e) => setM({ notes: e.target.value })} />
              <div className="fd-label" style={{ marginBottom: 6 }}>Stay history ({guestProfile.stays.length}) - total paid {money(guestProfile.stays.reduce((s, b) => s + b.paid, 0))}</div>
              {guestProfile.stays.map((b) => (
                <div key={b.id} className="fd-list-row">
                  <div><div className="fd-list-name">{b.id} - Room {b.room || "unassigned"}</div><div className="fd-list-sub">{displayDate(b.checkIn)} to {displayDate(b.checkOut)} - {b.purpose}</div></div>
                  <span className={`fd-status-pill badge-${b.status}`}>{b.status}</span>
                </div>
              ))}
            </div>
          </Modal>
        );
      })()}

      {passBooking && (
        <Modal onClose={() => setPassBooking(null)} width={420}>
          <div className="fd-pass-header">
            <div>
              <div className="fd-pass-hotel">The Regal Court Hotel</div>
              <div className="fd-pass-title">Digital check-in pass</div>
            </div>
            <button className="fd-modal-close-btn" onClick={() => setPassBooking(null)}><Icon name="close" size={18} color="#fff" /></button>
          </div>
          <div className="fd-pass-body">
            {bookings.find((b) => b.id === passBooking.id)?.status === "Checked-Out" && (
              <div className="fd-error" style={{ marginBottom: 8 }}>This pass is no longer valid. The guest has checked out.</div>
            )}
            <div className="fd-pass-guest-row">
              <div className="fd-pass-qr-box">
                <svg width="54" height="54" viewBox="0 0 54 54">
                  <rect width="54" height="54" fill="#fff" />
                  {Array.from({ length: 7 }).map((_, i) =>
                    Array.from({ length: 7 }).map((__, j) =>
                      (i + j) % 3 === 0 || i === 0 || j === 0 || i === 6 || j === 6 ? <rect key={`${i}-${j}`} x={i * 7.7} y={j * 7.7} width="7.5" height="7.5" fill="#1B2A4A" /> : null
                    )
                  )}
                </svg>
              </div>
              <div>
                <div className="fd-pass-name">{passBooking.name}</div>
                <div className="fd-pass-id">Booking {passBooking.id}</div>
              </div>
            </div>
            <div className="fd-pass-details">
              <div><div className="fd-pass-detail-label">Room</div><div className="fd-pass-detail-value fd-pass-detail-value-gold">{passBooking.room}</div></div>
              <div><div className="fd-pass-detail-label">Floor</div><div className="fd-pass-detail-value">{rooms.find((r) => r.number === passBooking.room)?.floor}</div></div>
              <div><div className="fd-pass-detail-label">Guests</div><div className="fd-pass-detail-value">{passBooking.guests}</div></div>
              <div><div className="fd-pass-detail-label">Check-in</div><div className="fd-pass-detail-value-sm">{displayDate(passBooking.checkIn)} from {CHECKIN_HOUR}:00</div></div>
              <div><div className="fd-pass-detail-label">Check-out</div><div className="fd-pass-detail-value-sm">{displayDate(passBooking.checkOut)} by {CHECKOUT_HOUR}:00 AM</div></div>
            </div>
            <div className="fd-pass-actions">
              <button className="fd-btn-outline" onClick={() => window.print()}><Icon name="print" size={15} color="var(--navy)" /> Print</button>
              <button className="fd-btn-solid" onClick={() => downloadPass(passBooking)}><Icon name="download" size={15} color="#fff" /> Download</button>
            </div>
          </div>
        </Modal>
      )}

      <Toast message={toast} onClose={() => setToast("")} />
    </div>
  );
}