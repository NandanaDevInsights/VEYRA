import { useState, useEffect } from "react";
import "./SplashAnimation.css";

export default function SplashAnimation({ onComplete }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Stage 1 (0-1.1s), Stage 2 (1.15-2.1s), Stage 3 (2.05-2.9s), VEYRA text (2.25-3.1s)
    // Hold completed logo and name, then smoothly fade out to reveal homepage
    const fadeTimer = setTimeout(() => {
      setFading(true);
    }, 3600);

    const finishTimer = setTimeout(() => {
      if (onComplete) onComplete();
    }, 4200);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, [onComplete]);

  const handleSkip = () => {
    setFading(true);
    setTimeout(() => {
      if (onComplete) onComplete();
    }, 350);
  };

  return (
    <div
      className={`veyra-splash-overlay ${fading ? "veyra-splash-fade" : ""}`}
      onClick={handleSkip}
      title="Click to enter"
      role="banner"
      aria-label="VEYRA Intro Animation"
    >
      <div className="stage" aria-label="Animated VEYRA hotel logo: V appears, then a home symbol, then the completed gold and navy emblem">
        <svg viewBox="0 0 600 600" role="img" aria-labelledby="splashTitle">
          <title id="splashTitle">VEYRA animated logo symbol</title>
          <defs>
            <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f7d778" />
              <stop offset="48%" stopColor="#d99b2e" />
              <stop offset="100%" stopColor="#a96712" />
            </linearGradient>
          </defs>

          {/* Stage 1: a simple V draws in */}
          <path className="v-shape" d="M145 190 L285 430 L455 175" />

          {/* Stage 2: the roof and window appear */}
          <path className="roof" d="M205 190 L300 125 L395 190" />
          <g className="window">
            <rect x="266" y="210" width="27" height="27" />
            <rect x="307" y="210" width="27" height="27" />
            <rect x="266" y="250" width="27" height="27" />
            <rect x="307" y="250" width="27" height="27" />
          </g>

          {/* Stage 3: the final premium V/home emblem forms */}
          <path className="gold-left" d="M120 190 L235 190 C215 192 216 214 229 237 L300 367 L285 430 Z" />
          <path className="gold-right" d="M300 367 L365 248 C388 207 412 184 455 175 C422 198 407 232 390 267 L300 430 L285 430 Z" />
          <path className="navy-fold" d="M300 367 L365 248 C379 225 391 207 409 193 C386 231 370 274 348 311 L300 385 Z" />

          {/* Stage 4: Brand name VEYRA */}
          <text className="veyra-brand-text" x="295" y="495" textAnchor="middle">VEYRA</text>
        </svg>
      </div>

      <button
        type="button"
        className="veyra-splash-skip"
        onClick={(e) => {
          e.stopPropagation();
          handleSkip();
        }}
        aria-label="Skip intro"
      >
        Skip &rarr;
      </button>
    </div>
  );
}
