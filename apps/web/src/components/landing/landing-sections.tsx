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
          <span className="eyebrow">
            Open-source research infrastructure for AI in education
          </span>
          <h1>
            Don&apos;t settle the question.
            <br />
            <em>Instrument it.</em>
          </h1>
          <p className="hero-sub">
            Evaluchat Canvas is the open-source workspace for trying methods,
            running research apparatuses and learning from what happens when AI
            is available.
          </p>
          <div className="hero-ctas">
            <OpenCanvasButton className="btn btn-primary">
              Open Canvas
              <ArrowRight className="arrow" width={15} height={15} />
            </OpenCanvasButton>
            <a className="btn btn-outline" href="#apparatuses">
              Explore the apparatuses
            </a>
          </div>
          <div className="hero-trust" aria-label="Platform foundations">
            <span>Canvas workspace</span>
            <span>OKF knowledge</span>
            <span>Git provenance</span>
          </div>
        </div>

        <div className="hero-visual">
          <div
            className="research-schematic"
            aria-label="A Canvas research apparatus turns a question into inspectable evidence"
          >
            <div className="schematic-head">
              <span className="schematic-file">experiment.md</span>
              <span className="mono-chip live">Canvas apparatus</span>
            </div>
            <div className="schematic-body">
              <p className="schematic-label">Research question</p>
              <p className="schematic-question">
                What changes when AI is used as a critic rather than a
                generator?
              </p>
              <div className="schematic-flow" aria-hidden="true">
                <span>Canvas session</span>
                <i>→</i>
                <span>method</span>
                <i>→</i>
                <span>evidence</span>
              </div>
              <div className="schematic-evidence">
                <span className="evidence-dot" />
                <span>
                  Reviewed contribution · methods and provenance attached
                </span>
              </div>
            </div>
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

const CANVAS_LAYERS = [
  {
    label: "Canvas",
    title: "A workspace for the work itself.",
    body: "Markdown documents, workspaces, AI sessions and meaningful activity stay together instead of disappearing into a black-box chat.",
  },
  {
    label: "Apparatus",
    title: "A method made runnable.",
    body: "A reproducible configuration of Canvas capabilities, workflow and measurement for investigating a specific research question.",
  },
  {
    label: "Evidence",
    title: "An outcome others can inspect.",
    body: "Reviewed contributions connect question, method, activity and claim—leaving room for challenge, replication and inconclusive results.",
  },
];

export function BuildingSection() {
  return (
    <section className="canvas-platform section" id="canvas">
      <div className="container">
        <span className="eyebrow">The common workspace</span>
        <h2>Canvas is where research becomes practical.</h2>
        <p className="lede">
          Canvas is not an Essays chatbot. It is the shared, open surface where
          documents, AI, research methods and the evidence they produce can
          meet.
        </p>
        <div className="platform-map">
          {CANVAS_LAYERS.map((layer, index) => (
            <div className="platform-step" key={layer.label}>
              <div className="platform-node">
                <span className="platform-number">0{index + 1}</span>
                <p className="platform-label">{layer.label}</p>
                <h3>{layer.title}</h3>
                <p>{layer.body}</p>
              </div>
              {index < CANVAS_LAYERS.length - 1 && (
                <span className="platform-arrow" aria-hidden="true">
                  →
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="dark-ctas">
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
            View the source
          </a>
        </div>
      </div>
    </section>
  );
}

const APPARATUSES = [
  {
    number: "01",
    title: "AI-assisted Essays",
    status: "Implemented",
    description:
      "A research apparatus for trying AI-assisted writing workflows, recording the process and examining the thinking behind the final artefact.",
  },
  {
    number: "02",
    title: "AI Assignment Stress Test",
    status: "In development",
    description:
      "A research apparatus for examining what an assignment measures when current AI can complete part of the task—and for testing alternatives.",
  },
];

export function ApparatusesSection() {
  return (
    <section className="apparatuses section" id="apparatuses">
      <div className="container">
        <span className="eyebrow">Research apparatuses</span>
        <h2>First experiments, not feature tabs.</h2>
        <p className="lede">
          Each apparatus makes a research question runnable on Canvas. Essays
          and the Assignment Stress Test are the first examples of an open
          catalogue that can grow with the questions worth asking.
        </p>
        <div className="apparatus-grid">
          {APPARATUSES.map((apparatus) => (
            <article className="apparatus-card" key={apparatus.number}>
              <div className="apparatus-meta">
                <span>Apparatus {apparatus.number}</span>
                <span>{apparatus.status}</span>
              </div>
              <h3>{apparatus.title}</h3>
              <p>{apparatus.description}</p>
            </article>
          ))}
        </div>
        <p className="apparatus-note">
          <strong>One Canvas, many methods.</strong> The point is not to prove
          one answer—it is to make competing approaches testable.
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
    <section className="research section" id="evidence">
      <div className="container">
        <span className="eyebrow">Evidence, not announcements</span>
        <h2>Let the work be questioned.</h2>
        <p className="lede">
          Research should show what was tried, how it was measured and where a
          claim came from—not just offer a polished conclusion.
        </p>
        <div className="evidence-flow" aria-label="Evidence lifecycle">
          <span>Question</span>
          <i>→</i>
          <span>Method</span>
          <i>→</i>
          <span>Canvas activity</span>
          <i>→</i>
          <span>Reviewed contribution</span>
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
            href="https://github.com/evaluchat/research"
            target="_blank"
            rel="noopener noreferrer"
          >
            Explore the research
          </a>
        </div>
      </div>
    </section>
  );
}

const OPEN_LAYERS = [
  {
    label: "Canvas",
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
            href="https://github.com/evaluchat/canvas"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
          <OpenCanvasButton className="btn btn-ghost">
            Open Canvas
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
          Canvas gives the experiment a place to happen. Open methods and
          portable knowledge give the result a chance to matter.
        </p>
        <div className="final-ctas">
          <OpenCanvasButton className="btn btn-primary">
            Open Canvas
            <ArrowRight className="arrow" width={15} height={15} />
          </OpenCanvasButton>
          <a
            className="btn btn-outline"
            href="https://github.com/evaluchat/research"
            target="_blank"
            rel="noopener noreferrer"
          >
            Explore the research
          </a>
        </div>
      </div>
    </section>
  );
}
