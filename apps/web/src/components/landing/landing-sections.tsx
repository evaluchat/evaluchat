"use client";

import { useUserContext } from "@/contexts/UserContext";
import { ArrowRight } from "lucide-react";

function OpenCanvasButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { user } = useUserContext();
  const href = user ? "/canvas" : "/auth/login";
  return (
    <a className={className} href={href}>
      {children}
    </a>
  );
}

export function HeroSection() {
  return (
    <section className="hero">
      <div className="container hero-inner">
        <div>
          <span className="eyebrow">Learning in the age of AI</span>
          <h1>
            AI isn&apos;t going away.
            <br />
            <em>What should we be measuring?</em>
          </h1>
          <p className="hero-sub">
            <strong>Nobody knows yet. Let&apos;s find out.</strong>
          </p>
          <div className="hero-ctas">
            <a className="btn btn-primary" href="#canvas">
              Open Canvas
              <ArrowRight className="arrow" width={15} height={15} />
            </a>
            <a className="btn btn-outline" href="#present">
              Explore the questions
            </a>
          </div>
        </div>

        <div className="hero-visual">
          <div className="doc">
            <video
              className="aspect-video w-full object-cover"
              src="/login-demo.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="Short demo of Evaluchat coaching a writing assignment"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export function HypothesisSection() {
  return (
    <section className="hypothesis section" id="about">
      <div className="container hypo-grid">
        <div>
          <h2>The problem is already here.</h2>
          <p className="hypo-stand">
            An AI can write the paper, solve the problem, find the sources.
          </p>
          <p className="hypo-stand">
            That doesn&apos;t necessarily tell us whether the person using it
            understands the subject.
          </p>
          <p className="hypo-stand">
            But removing AI doesn&apos;t necessarily tell us what we most want
            to know, either.
          </p>
          <p className="hypo-stand">
            <strong>So what are we actually trying to measure?</strong>
          </p>
        </div>
        <div className="guide-card">
          <p className="g-q">
            What should people still know, decide, explain and demonstrate when
            AI is available?
          </p>
          <p className="g-sub">
            We don&apos;t have a settled answer. We think the best way forward
            is to test the alternatives.
          </p>
        </div>
      </div>
    </section>
  );
}

export function MeasuresSection() {
  return (
    <section className="measures section" id="measures">
      <div className="container">
        <h2>Three questions. Not one.</h2>
        <p className="lede">
          When we ask whether someone can &quot;do it&quot;, we might mean very
          different things.
        </p>
        <div className="meas-grid">
          <div className="meas">
            <span className="m-n">01</span>
            <b>Produce</b>
            <p>Can they produce the conventional answer without AI?</p>
          </div>
          <div className="meas">
            <span className="m-n">02</span>
            <b>Understand</b>
            <p>Do they have the underlying knowledge and understanding?</p>
          </div>
          <div className="meas">
            <span className="m-n">03</span>
            <b>Work with AI</b>
            <p>
              Can they question it, evaluate it, correct it and use it
              effectively?
            </p>
          </div>
        </div>
        <p className="lede" style={{ marginTop: 28 }}>
          These abilities overlap. They aren&apos;t interchangeable.
        </p>
        <p className="lede">
          <strong>We don&apos;t yet know how the balance should change.</strong>
        </p>
      </div>
    </section>
  );
}

const PROBLEMS = [
  {
    p: "AI can write the assignment.",
    q: "What exactly are we assessing?",
  },
  {
    p: "AI can solve the homework.",
    q: "What is the homework for?",
  },
  {
    p: "AI can argue both sides.",
    q: "What should a debate actually measure?",
  },
  {
    p: "AI can produce ten plausible answers.",
    q: "Is producing another answer really the skill?",
  },
  {
    p: "AI can tutor indefinitely.",
    q: "What should a teacher spend their time doing?",
  },
];

export function ProblemsSection() {
  return (
    <section className="problems section" id="present">
      <div className="container">
        <h2>The questions aren&apos;t theoretical.</h2>
        <div className="prob-list">
          {PROBLEMS.map((row) => (
            <div className="prob-row" key={row.p}>
              <span className="p">{row.p}</span>
              <span className="a">→</span>
              <span className="q">{row.q}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function BuildingSection() {
  return (
    <section className="section" id="building">
      <div className="container">
        <h2>We&apos;re building things to investigate the question.</h2>
        <div className="meas-grid" style={{ marginTop: 36 }}>
          <div className="meas" id="canvas">
            <b>Canvas</b>
            <p>
              <strong>A document workspace for working with AI.</strong>
            </p>
            <p>
              Markdown, structure, diagrams, mathematics, AI assistance and
              clean output — without turning the document into a proprietary
              blob.
            </p>
            <p>
              <strong>Education is one audience. Not the only one.</strong>
            </p>
            <div className="dark-ctas" style={{ marginTop: 18 }}>
              <OpenCanvasButton className="btn btn-primary">
                Open Canvas
                <ArrowRight className="arrow" width={15} height={15} />
              </OpenCanvasButton>
              <a
                className="btn btn-outline"
                href="https://github.com/evaluchat/canvas"
                target="_blank"
                rel="noopener noreferrer"
              >
                View on GitHub
              </a>
            </div>
          </div>
          <div className="meas" id="essays">
            <b>Essays</b>
            <p>
              <strong>A different way to use AI for writing.</strong>
            </p>
            <p>
              Research. Arguments. Challenges. Drafts. Revisions. Reflection.
            </p>
            <p>
              AI can be the critic, the opponent, the Socratic partner — or
              simply a source of ideas.
            </p>
            <p>
              <strong>
                The interesting part is what the student does with it.
              </strong>
            </p>
            <div className="dark-ctas" style={{ marginTop: 18 }}>
              <a className="btn btn-outline" href="/auth/signup">
                Explore Essays
              </a>
            </div>
          </div>
          <div className="meas" id="research-build">
            <b>Research</b>
            <p>
              <strong>Find out what actually happens.</strong>
            </p>
            <p>
              Experiments with learning, assessment and different ways of
              working with AI.
            </p>
            <p>
              <strong>Questions first. Evidence when we have it.</strong>
            </p>
            <div className="dark-ctas" style={{ marginTop: 18 }}>
              <a
                className="btn btn-outline"
                href="https://github.com/evaluchat/research"
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the research
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function StressTestSection() {
  return (
    <section className="freetools section">
      <div className="container">
        <div className="ft-feature">
          <div>
            <h2>Give us the assignment.</h2>
            <p>AI can probably do more of it than you think.</p>
            <p>
              The interesting question is what the assignment asks the student
              to do that AI can&apos;t simply do for them.
            </p>
            <p>Paste it in. We&apos;ll take a look.</p>
            <div className="ftf-meta">
              <span className="mono-chip wip">In development</span>
              <button type="button" className="btn btn-outline">
                Try the Stress Test
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const TOOL_COLS = [
  {
    h: "For teachers",
    tools: "Assignment analysis · Assessment redesign · AI policy · Rubrics",
  },
  {
    h: "For students",
    tools:
      "Study coaching · Argument testing · Source evaluation · Thesis challenges",
  },
  {
    h: "For everyone",
    tools: "Markdown → PDF · Mermaid · LaTeX · Document formatting",
  },
];

export function FreeToolsSection() {
  return (
    <section className="freetools section" id="tools">
      <div className="container">
        <h2>Try something useful.</h2>
        <div className="audcols">
          {TOOL_COLS.map((col) => (
            <div className="audcol" key={col.h}>
              <h3>{col.h}</h3>
              <p>{col.tools}</p>
            </div>
          ))}
        </div>
        <p className="lede" style={{ marginTop: 28 }}>
          <strong>Free to use.</strong>
        </p>
      </div>
    </section>
  );
}

const RESEARCH_QUESTIONS = [
  "Does using AI as a critic produce different thinking from using it as a generator?",
  "Can students recognise when AI is wrong?",
  "What remains when the AI is taken away?",
  "Does AI change what people retain and transfer?",
];

export function ResearchSection() {
  return (
    <section className="research section" id="research">
      <div className="container">
        <h2>These are empirical questions.</h2>
        <div className="prog-list" style={{ marginTop: 28 }}>
          {RESEARCH_QUESTIONS.map((q, i) => (
            <div className="prog" key={q}>
              <span className="p-n">0{i + 1}</span>
              <div>
                <b>{q}</b>
              </div>
            </div>
          ))}
        </div>
        <p className="lede" style={{ marginTop: 28 }}>
          <strong>
            When we have something worth reporting, we&apos;ll show our work.
          </strong>
        </p>
        <div className="dark-ctas" style={{ marginTop: 22 }}>
          <a
            className="btn btn-outline"
            href="https://github.com/evaluchat/research"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read the research
          </a>
        </div>
      </div>
    </section>
  );
}

export function OssSection() {
  return (
    <section className="oss section" id="opensource">
      <div className="container oss-inner">
        <div>
          <h2>Open source.</h2>
          <p className="lede">Canvas is MIT-licensed and self-hostable.</p>
          <p className="lede">
            Use the hosted version if you want convenience. Run it yourself if
            you don&apos;t.
          </p>
          <p className="lede">
            The documents stay portable. The core stays open.
          </p>
          <div className="dark-ctas">
            <a
              className="btn btn-primary"
              href="https://github.com/evaluchat/canvas"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            <OpenCanvasButton className="btn btn-outline">
              Open Canvas
              <ArrowRight className="arrow" width={15} height={15} />
            </OpenCanvasButton>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FinalCtaSection() {
  return (
    <section className="final-cta">
      <div className="container">
        <h2>We&apos;re going to keep asking the question.</h2>
        <p>And build things that help us get better answers.</p>
        <div className="final-ctas">
          <OpenCanvasButton className="btn btn-primary">
            Open Canvas
            <ArrowRight className="arrow" width={15} height={15} />
          </OpenCanvasButton>
          <button type="button" className="btn btn-outline">
            Read the research
          </button>
          <a className="btn btn-outline" href="#tools">
            Try a tool
          </a>
        </div>
      </div>
    </section>
  );
}
