"use client";

import { useUserContext } from "@/contexts/UserContext";
import { postLoginPath } from "@/lib/teaching/config";
import { ArrowRight } from "lucide-react";

function OpenCanvasButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { user } = useUserContext();
  const href = user ? postLoginPath(user) : "/auth/login";

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
            Evaluchat is an open-source workspace for testing how education
            responds to AI: using it, constraining it or examining evidence of
            its use. We make the methods visible so we can see what each one
            actually measures.
          </p>
          <div className="hero-ctas">
            <OpenCanvasButton className="btn btn-primary">
              Open Workspace
              <ArrowRight className="arrow" width={15} height={15} />
            </OpenCanvasButton>
            <a className="btn btn-outline" href="#research">
              Explore the research
            </a>
          </div>
          <div className="hero-trust" aria-label="Platform foundations">
            <span>Workspace</span>
            <span>OKF knowledge</span>
            <span>Git provenance</span>
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
          <h2>AI changed the conditions. Not the need for evidence.</h2>
          <p className="hypo-stand">
            An AI can write the paper, solve the problem and find the sources.
            That does not tell us what the person using it understands.
          </p>
          <p className="hypo-stand">
            Removing AI does not answer every question either. It can hide the
            judgement, reasoning and decisions people make when AI is part of
            the work.
          </p>
          <p className="hypo-stand">
            <strong>
              We don&apos;t know what learning and assessment should measure
              now.
            </strong>
          </p>
        </div>
        <div className="guide-card">
          <p className="g-label">The shared question</p>
          <p className="g-q">
            What should people still know, decide, explain and demonstrate when
            AI is available?
          </p>
          <p className="g-sub">
            Evaluchat does not offer a settled answer. It makes the alternatives
            easier to try, inspect and improve together.
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
];

export function ProblemsSection() {
  return (
    <section className="problems section" id="questions">
      <div className="container">
        <h2>Questions worth testing, not declaring.</h2>
        <p className="lede">
          The uncomfortable questions are already in classrooms and workplaces.
        </p>
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

const CANVAS_CAPABILITIES = [
  {
    label: "Optional AI assistance",
    title: "Help when you want it",
    body: "Ask the assistant to suggest, revise or explain content when useful; the Workspace remains fully usable with AI turned off.",
  },
  {
    label: "Mermaid + LaTeX",
    title: "Render the work as you write",
    body: "Render Mermaid diagrams and LaTeX directly in the Workspace alongside the document.",
  },
  {
    label: "Printing",
    title: "Take the work with you",
    body: "Print the document or create clean PDF output for sharing and review.",
  },
];

export function BuildingSection() {
  return (
    <section className="canvas-platform section" id="canvas">
      <div className="container">
        <span className="eyebrow">The common workspace</span>
        <h2>A practical place for methods to take shape.</h2>
        <p className="lede">
          The Workspace is useful on its own—and gives teachers and researchers
          an open surface for designing, running and explaining new ways of
          working with AI.
        </p>
        <div className="platform-map">
          {CANVAS_CAPABILITIES.map((layer, index) => (
            <div className="platform-step" key={layer.label}>
              <div className="platform-node">
                <span className="platform-number">0{index + 1}</span>
                <p className="platform-label">{layer.label}</p>
                <h3>{layer.title}</h3>
                <p>{layer.body}</p>
              </div>
              {index < CANVAS_CAPABILITIES.length - 1 && (
                <span className="platform-arrow" aria-hidden="true">
                  →
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="dark-ctas">
          <OpenCanvasButton className="btn btn-primary">
            Open Workspace
            <ArrowRight className="arrow" width={15} height={15} />
          </OpenCanvasButton>
          <a
            className="btn btn-outline"
            href="https://knowledge.evaluchat.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read Workspace documentation
          </a>
        </div>
      </div>
    </section>
  );
}

const RESEARCH_QUESTIONS = [
  "Does using AI as a critic produce different thinking from using it as a generator?",
  "Can students recognise when AI is wrong?",
  "What remains when the AI is taken away?",
  "Does AI change what people retain and transfer?",
  "Can revision history provide trustworthy evidence of student process—and for which learners, tasks and AI-use patterns does it mislead?",
];

export function ResearchSection() {
  return (
    <section className="research section" id="research">
      <div className="container">
        <span className="eyebrow">Research in the open</span>
        <h2>A research programme that can evolve.</h2>
        <p className="lede">
          No position comes preloaded. The research catalogue records evolving
          methods that invite AI, constrain it or investigate claims about its
          use—and asks whether each one actually serves the learning objective
          it was designed for.
        </p>
        <div className="evidence-flow" aria-label="Evidence lifecycle">
          <span>Question</span>
          <i>→</i>
          <span>Method</span>
          <i>→</i>
          <span>Workspace activity</span>
          <i>→</i>
          <span>Public record</span>
          <i>→</i>
          <span>Claim, challenge or replication</span>
        </div>
        <div className="research-grid">
          <div>
            <p className="measure-label">Questions we can investigate</p>
            <div className="prog-list">
              {RESEARCH_QUESTIONS.map((question, index) => (
                <div className="prog" key={question}>
                  <span className="p-n">0{index + 1}</span>
                  <div>
                    <b>{question}</b>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="research-principles">
            <p className="measure-label">What makes it inspectable</p>
            <div>
              <b>Transparent methods</b>
              <p>Configuration and measurements travel with the work.</p>
            </div>
            <div>
              <b>Human review</b>
              <p>
                Teachers and researchers remain the authority on what happened.
              </p>
            </div>
            <div>
              <b>Room to disagree</b>
              <p>
                Challenges, replications and negative results are useful
                outcomes.
              </p>
            </div>
          </div>
        </div>
        <div className="dark-ctas">
          <a
            className="btn btn-outline"
            href="https://research.evaluchat.org/apparatus/index.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Explore the research catalogue
          </a>
        </div>
      </div>
    </section>
  );
}

const OPEN_LAYERS = [
  {
    label: "Workspace",
    text: "An MIT-licensed Markdown workspace: useful on its own and open to inspection, extension and self-hosting.",
  },
  {
    label: "OKF",
    text: "Portable Markdown and YAML knowledge that people and AI can use from the same, inspectable source material.",
  },
  {
    label: "Git",
    text: "History, attribution, review and distribution for methods, knowledge and public research contributions.",
  },
];

export function OssSection() {
  return (
    <section className="oss section" id="open-source">
      <div className="container">
        <span className="eyebrow on-dark">Open by design</span>
        <h2>Research becomes more useful when it can travel.</h2>
        <p className="lede">
          The novelty is not a hidden model. It is applying the technologies and
          practices of open-source projects to the work of figuring out AI in
          education.
        </p>
        <div className="open-layers">
          {OPEN_LAYERS.map((layer) => (
            <div className="open-layer" key={layer.label}>
              <span>{layer.label}</span>
              <p>{layer.text}</p>
            </div>
          ))}
        </div>
        <div className="dark-ctas">
          <a
            className="btn btn-primary"
            href="https://github.com/evaluchat/evaluchat"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
          <OpenCanvasButton className="btn btn-ghost">
            Open Workspace
            <ArrowRight className="arrow" width={15} height={15} />
          </OpenCanvasButton>
        </div>
      </div>
    </section>
  );
}

export function FinalCtaSection() {
  return (
    <section className="final-cta">
      <div className="container">
        <span className="eyebrow">The invitation</span>
        <h2>Bring a question. Try a method. Show your work.</h2>
        <p>
          The Workspace gives the experiment a place to happen. Open methods and
          portable knowledge give the result a chance to matter.
        </p>
        <div className="final-ctas">
          <OpenCanvasButton className="btn btn-primary">
            Open Workspace
            <ArrowRight className="arrow" width={15} height={15} />
          </OpenCanvasButton>
          <a
            className="btn btn-outline"
            href="https://research.evaluchat.org/apparatus/index.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Explore the research catalogue
          </a>
        </div>
      </div>
    </section>
  );
}
