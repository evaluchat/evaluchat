"use client";

import Image from "next/image";
import Link from "next/link";

export function LandingFooter() {
  return (
    <footer>
      <div className="container">
        <div className="foot-grid">
          <div className="foot-brand">
            <Link className="brand" href="/">
              <Image
                className="brand-mark"
                src="/evaluchat.png"
                alt="evaluchat"
                width={32}
                height={32}
              />
              <span>evaluchat</span>
            </Link>
            <p>
              Tools and experiments for learning, thinking and working with AI.
            </p>
          </div>
          <div className="foot-col">
            <h4>Projects</h4>
            <a href="#canvas">Canvas</a>
            <a href="#essays">Essays</a>
            <a href="#research">Research</a>
            <a href="#tools">Tools</a>
          </div>
          <div className="foot-col">
            <h4>About</h4>
            <a href="#about">About</a>
            <a
              href="https://github.com/evaluchat/canvas"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            <a href="/auth/login">Sign in</a>
          </div>
          <div className="foot-col">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href="https://status.evaluchat.org">Status</a>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© 2026 Evaluchat</span>
        </div>
      </div>
    </footer>
  );
}
