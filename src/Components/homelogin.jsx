import React, { useState, useEffect, useCallback } from "react";
import Login from "./login.jsx";
import "./homelogin.css";

const slides = [
  "https://media.cntraveler.com/photos/59400502494db63f5b616059/16:9/w_2560%2Cc_limit/Suite1-GrandHotelduCapFerrat-France-CRHotel.jpg",
  "https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1600&q=80",
  "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=1600&q=80",
  "https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1600&q=80",
  "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1600&q=80",
  "https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=1600&q=80",
];

const stats = [
  { icon: "ti-bed", value: "128", label: "Rooms managed" },
  { icon: "ti-users", value: "42", label: "Staff accounts" },
  { icon: "ti-building", value: "4", label: "Departments" },
  { icon: "ti-chart-pie", value: "94%", label: "Current occupancy" },
];

const departments = [
  { icon: "ti-door", title: "Front desk", desc: "Bookings, room allocation, and digital check-in passes." },
  { icon: "ti-sparkles", title: "Housekeeping", desc: "Real-time room status across every floor." },
  { icon: "ti-file-invoice", title: "Billing", desc: "Itemized invoices and organized payment records." },
  { icon: "ti-settings", title: "Administration", desc: "Staff accounts, permissions, and property-wide reports." },
];

const journey = [
  { icon: "ti-calendar-plus", title: "Booking", desc: "Guest details, preferences, and room type captured in one form." },
  { icon: "ti-door-enter", title: "Check-in", desc: "Room allocated automatically, digital pass generated instantly." },
  { icon: "ti-bed", title: "The stay", desc: "Housekeeping and service requests tracked in real time." },
  { icon: "ti-receipt", title: "Check-out", desc: "Itemized billing settled and the room released for turnover." },
];

const benefits = [
  { icon: "ti-shield-check", title: "Role-based access", desc: "Each team sees only what they need." },
  { icon: "ti-clock-hour-4", title: "Faster front desk", desc: "Bookings and check-ins take minutes, not calls." },
  { icon: "ti-database", title: "One source of truth", desc: "Guests, rooms, and billing stay in sync." },
  { icon: "ti-chart-bar", title: "Reports on demand", desc: "Occupancy and revenue, searchable any time." },
];

export default function HomeLogin({ onLogin }) {
  const [current, setCurrent] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  const goTo = useCallback((i) => setCurrent((i + slides.length) % slides.length), []);

  useEffect(() => {
    const t = setInterval(() => setCurrent((p) => (p + 1) % slides.length), 5500);
    return () => clearInterval(t);
  }, [current]);

  // Always open at the top: stop the browser restoring the old scroll position
  // and drop any #hash (e.g. #contact) left in the URL from earlier link clicks.
  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Works with or without an onLogin prop: if the parent gives none, open Login here.
  const handleLogin = () => {
    window.scrollTo(0, 0);
    if (onLogin) onLogin();
    else setShowLogin(true);
  };

  // Smooth in-page jumps that do not write #hash into the URL
  const jump = (id) => (e) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  if (showLogin) return <Login />;

  return (
    <div className="hp">
      <nav className={`hp-nav ${scrolled ? "is-scrolled" : ""}`}>
        <a href="#top" onClick={jump("top")} className="hp-brand">
          <span className="hp-badge"><i className="ti ti-building-skyscraper" aria-hidden="true"></i></span>
          <span className="hp-brand-name">VEYRA</span>
        </a>
        <div className="hp-links">
          <a href="#overview" onClick={jump("overview")}>Overview</a>
          <a href="#departments" onClick={jump("departments")}>Departments</a>
          <a href="#journey" onClick={jump("journey")}>Guest journey</a>
          <a href="#contact" onClick={jump("contact")}>Contact</a>
        </div>
        <button type="button" className="hp-btn hp-btn--gold" onClick={handleLogin}>Staff login</button>
      </nav>

      <header className="hp-hero" id="top">
        {slides.map((src, i) => (
          <div
            key={i}
            className={`hp-slide ${i === current ? "is-active" : ""}`}
            style={{ backgroundImage: `url(${src})` }}
          ></div>
        ))}
        <div className="hp-hero-shade"></div>

        <div className="hp-caption">
          <h1>Every stay, precisely managed.</h1>
          <p>One system for bookings, rooms, and service, from arrival to departure.</p>
          <div className="hp-cta">
            <button type="button" className="hp-btn hp-btn--gold hp-btn--lg" onClick={handleLogin}>Staff login</button>
            <a href="#journey" onClick={jump("journey")} className="hp-btn hp-btn--ghost hp-btn--lg">See how it works</a>
          </div>
        </div>

        <div className="hp-controls">
          <button aria-label="Previous slide" onClick={() => goTo(current - 1)}>
            <i className="ti ti-chevron-left" aria-hidden="true"></i>
          </button>
          <div className="hp-dots">
            {slides.map((_, i) => (
              <button
                key={i}
                aria-label={`Slide ${i + 1}`}
                className={i === current ? "is-active" : ""}
                onClick={() => goTo(i)}
              ></button>
            ))}
          </div>
          <button aria-label="Next slide" onClick={() => goTo(current + 1)}>
            <i className="ti ti-chevron-right" aria-hidden="true"></i>
          </button>
        </div>
      </header>

      <section className="hp-stats" id="overview">
        {stats.map((s) => (
          <div className="hp-stat" key={s.label}>
            <i className={`ti ${s.icon}`} aria-hidden="true"></i>
            <div>
              <p className="hp-stat-value">{s.value}</p>
              <p className="hp-stat-label">{s.label}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="hp-section" id="departments">
        <div className="hp-inner">
          <h2 className="hp-h2">One platform, four teams, zero paperwork.</h2>
          <p className="hp-lede">Every department works from the same live record, with its own tools and permissions.</p>
          <div className="hp-dept-grid">
            {departments.map((d) => (
              <div className="hp-dept" key={d.title}>
                <span className="hp-dept-icon"><i className={`ti ${d.icon}`} aria-hidden="true"></i></span>
                <h3>{d.title}</h3>
                <p>{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="hp-journey" id="journey">
        <div className="hp-inner">
          <h2 className="hp-h2 hp-h2--light">The guest journey, end to end.</h2>
          <p className="hp-lede hp-lede--light">Four stages, one connected record.</p>
          <ol className="hp-steps">
            {journey.map((s, i) => (
              <li key={s.title}>
                <span className="hp-step-icon"><i className={`ti ${s.icon}`} aria-hidden="true"></i></span>
                <span className="hp-step-num">Step {i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="hp-section hp-why">
        <div className="hp-inner hp-why-grid">
          <div className="hp-why-media">
            <img src={slides[2]} alt="Hotel lobby" />
          </div>
          <div>
            <h2 className="hp-h2 hp-h2--left">Built to make every shift easier.</h2>
            <div className="hp-benefits">
              {benefits.map((b) => (
                <div className="hp-benefit" key={b.title}>
                  <span className="hp-benefit-icon"><i className={`ti ${b.icon}`} aria-hidden="true"></i></span>
                  <div>
                    <h3>{b.title}</h3>
                    <p>{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="hp-footer" id="contact">
        <div className="hp-footer-grid">
          <div>
            <span className="hp-footer-brand">VEYRA</span>
            <p className="hp-footer-about">Internal staff system for front desk, housekeeping, billing, and administration.</p>
          </div>
          <div>
            <p className="hp-footer-head">Contact</p>
            <p><i className="ti ti-phone" aria-hidden="true"></i>+91 484 220 1145</p>
            <p><i className="ti ti-mail" aria-hidden="true"></i>frontdesk@veyra.com</p>
            <p><i className="ti ti-map-pin" aria-hidden="true"></i>Kozhikode, Kerala</p>
          </div>
          <div>
            <p className="hp-footer-head">Support</p>
            <p>IT Helpdesk</p>
            <p>Staff Handbook</p>
            <p>Report an Issue</p>
          </div>
        </div>
        <div className="hp-footer-bottom">Internal use only &middot; VEYRA</div>
      </footer>
    </div>
  );
}