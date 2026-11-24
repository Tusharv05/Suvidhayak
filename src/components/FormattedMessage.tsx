import { useState } from 'react';
import { ChevronDown, ChevronRight, Pill, AlertCircle, Volume2, Square } from 'lucide-react';

// ─── types ───────────────────────────────────────────────────────────────────

interface Section {
  num: number;          // original number in text
  displayNum: number;   // displayed number (OTC always shown as 3)
  heading: string;
  body: string;
  isOTC: boolean;
}

interface ParsedResponse {
  intro: string;
  sections: Section[];
  closing: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Strip markdown bold/italic markers and leading/trailing spaces */
function stripMd(s: string): string {
  return s.replace(/\*{1,3}([^*]+?)\*{1,3}/g, '$1').replace(/_{1,2}([^_]+?)_{1,2}/g, '$1').trim();
}

// ─── parser ──────────────────────────────────────────────────────────────────

function parseAIResponse(text: string): ParsedResponse | null {
  const lines = text.split('\n');

  let state: 'intro' | 'sections' | 'closing' = 'intro';
  let intro = '';
  let closing = '';

  interface RawSection { num: number; heading: string; bodyLines: string[] }
  const rawSections: RawSection[] = [];
  let current: RawSection | null = null;

  // ── numbered line parser helper ──────────────────────────────────────────
  // Handles: "1. **Heading**: body" | "1. Heading: body" | "1. Heading"
  const parseNumberedLine = (line: string): { num: number; heading: string; body: string } | null => {
    const numM = line.match(/^(\d+)\.\s+(.*)/);
    if (!numM) return null;
    const num = parseInt(numM[1]);
    const rest = numM[2].trim();
    // Bold heading: **Heading**: body  OR  **Heading** body
    const boldM = rest.match(/^\*{1,3}([^*\n]+)\*{1,3}[:\s]*(.*)/);
    if (boldM) return { num, heading: boldM[1].trim(), body: boldM[2].trim() };
    // Plain heading with colon separator: Heading: body
    const colonM = rest.match(/^([^:\n]{2,60}):\s+(.+)/);
    if (colonM) return { num, heading: colonM[1].trim(), body: colonM[2].trim() };
    // Heading ends with colon but body is on next lines — strip the trailing colon
    const colonTrailingM = rest.match(/^([^:\n]{2,60}):\s*$/);
    if (colonTrailingM) return { num, heading: colonTrailingM[1].trim(), body: '' };
    // Just a heading, no body on the same line
    return { num, heading: rest, body: '' };
  };

  // Also matches standalone "**Heading**:" or "## Heading" as section starters (fallback)
  const boldHeadingRe = /^\*{2,3}([^*\n]+)\*{2,3}[:\s]*(.*)/;
  const mdHeadingRe = /^#{1,3}\s+(.+)/;
  const closingTrigger = /^(now,\s|you.?re doing|when you should|let.?s talk about when|seek\s+(?:immediate|emergency|medical))/i;

  for (const line of lines) {
    if (state === 'intro') {
      const m = parseNumberedLine(line);
      if (m) {
        state = 'sections';
        current = { num: m.num, heading: stripMd(m.heading), bodyLines: m.body ? [m.body] : [] };
      } else {
        intro += line + '\n';
      }
    } else if (state === 'sections') {
      const m = parseNumberedLine(line);
      if (m) {
        if (current) rawSections.push(current);
        current = { num: m.num, heading: stripMd(m.heading), bodyLines: m.body ? [m.body] : [] };
      } else if (line.match(closingTrigger)) {
        if (current) { rawSections.push(current); current = null; }
        state = 'closing';
        closing += line + '\n';
      } else if (current) {
        current.bodyLines.push(line);
      }
    } else {
      closing += line + '\n';
    }
  }
  if (current) rawSections.push(current);

  // ── Fallback: try bold/markdown headings when no numbered sections found ──
  if (rawSections.length === 0) {
    let fbCurrent: RawSection | null = null;
    let fbIntro = '';
    let fbClosing = '';
    let fbState: 'intro' | 'sections' | 'closing' = 'intro';
    let fbNum = 0;

    for (const line of lines) {
      const boldM = line.match(boldHeadingRe);
      const mdM = line.match(mdHeadingRe);
      const isHeading = boldM || mdM;

      if (fbState === 'intro') {
        if (isHeading) {
          fbState = 'sections';
          fbNum++;
          const heading = stripMd(boldM ? boldM[1] : mdM![1]);
          const rest = boldM ? boldM[2].trim() : '';
          fbCurrent = { num: fbNum, heading, bodyLines: [rest] };
        } else {
          fbIntro += line + '\n';
        }
      } else if (fbState === 'sections') {
        if (line.match(closingTrigger)) {
          if (fbCurrent) { rawSections.push(fbCurrent); fbCurrent = null; }
          fbState = 'closing';
          fbClosing += line + '\n';
        } else if (isHeading) {
          if (fbCurrent) rawSections.push(fbCurrent);
          fbNum++;
          const heading = stripMd(boldM ? boldM[1] : mdM![1]);
          const rest = boldM ? boldM[2].trim() : '';
          fbCurrent = { num: fbNum, heading, bodyLines: [rest] };
        } else if (fbCurrent) {
          fbCurrent.bodyLines.push(line);
        }
      } else {
        fbClosing += line + '\n';
      }
    }
    if (fbCurrent) rawSections.push(fbCurrent);
    if (rawSections.length > 0) {
      intro = fbIntro;
      closing = fbClosing;
    }
  }

  if (rawSections.length === 0) return null;

  // ── reorder: OTC moves to display position 1 (first) ─────────────────────
  const otcIdx = rawSections.findIndex(s =>
    /over.the.counter|otc/i.test(s.heading)
  );

  let ordered = [...rawSections];
  if (otcIdx > 0) {
    const [otc] = ordered.splice(otcIdx, 1);
    ordered.splice(0, 0, otc);          // insert at index 0 → position 1
  }

  const sections: Section[] = ordered.map((s, i) => ({
    num: s.num,
    displayNum: i + 1,
    heading: s.heading,
    body: s.bodyLines.join('\n').trim(),
    // OTC by keyword, OR fallback to first section when no keyword match found
    isOTC: /over.the.counter|otc/i.test(s.heading) || (otcIdx < 0 && i === 0),
  }));

  return { intro: intro.trim(), sections, closing: closing.trim() };
}

// ─── small helpers ───────────────────────────────────────────────────────────

/** Convert "- item" / "* item" / "• item" / "1. item" bullet lines to lists, strips inline markdown */
function renderBody(body: string) {
  const lines = body.split('\n');
  const elements: JSX.Element[] = [];
  let bullets: string[] = [];
  let numberedItems: string[] = [];

  const flushBullets = (key: string) => {
    if (bullets.length) {
      elements.push(
        <ul key={key} className="mt-2 space-y-1 list-none">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
              {stripMd(b.replace(/^[-*•]\s*/, ''))}
            </li>
          ))}
        </ul>
      );
      bullets = [];
    }
  };

  const flushNumbered = (key: string) => {
    if (numberedItems.length) {
      elements.push(
        <ol key={key} className="mt-2 space-y-1 list-none">
          {numberedItems.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="flex-shrink-0 min-w-[1.1rem] text-purple-600 font-semibold text-xs pt-0.5">{i + 1}.</span>
              {stripMd(b.replace(/^\d+\.\s*/, ''))}
            </li>
          ))}
        </ol>
      );
      numberedItems = [];
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('-') || trimmed.startsWith('* ') || trimmed.startsWith('\u2022')) {
      flushNumbered(`nb-${idx}`);
      bullets.push(trimmed);
    } else if (/^\d+\.\s/.test(trimmed)) {
      flushBullets(`fb-${idx}`);
      numberedItems.push(trimmed);
    } else {
      flushBullets(`f-${idx}`);
      flushNumbered(`fn-${idx}`);
      elements.push(
        <p key={idx} className="text-sm text-gray-700 mt-1">{stripMd(trimmed)}</p>
      );
    }
  });
  flushBullets('final-b');
  flushNumbered('final-n');
  return elements;
}

/** Render the closing "when to see a doctor" block */
function renderClosing(text: string) {
  if (!text.trim()) return null;
  const lines = text.split('\n').filter(l => l.trim());
  const bullets: string[] = [];
  const paras: string[] = [];

  lines.forEach(l => {
    const t = l.trim();
    if (t.startsWith('-')) bullets.push(t.replace(/^-\s*/, ''));
    else paras.push(t);
  });

  return { paras, bullets };
}

// ─── doctor section accordion ────────────────────────────────────────────────

function DoctorSection({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const parsed = renderClosing(text);
  if (!parsed) return null;

  return (
    <div className="mt-3 border border-red-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-red-50 hover:bg-red-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
          <span className="text-sm font-semibold text-red-700">When to See a Doctor</span>
        </div>
        {open
          ? <ChevronDown size={16} className="text-red-400 flex-shrink-0" />
          : <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
        }
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 bg-red-50 border-t border-red-100 space-y-1">
          {parsed.paras.filter(p => !/when you should|when to see|let.s talk/i.test(p)).map((p, i) => (
            <p key={i} className="text-sm text-gray-700">{p}</p>
          ))}
          {parsed.bullets.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {parsed.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-red-700">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── emergency action-list layout ───────────────────────────────────────────

function EmergencyActionList({ parsed, msgId, onSpeak, stopTTS, playingId, isTTSPlaying }: {
  parsed: ParsedResponse;
  msgId?: string;
  onSpeak?: (text: string, id: string) => void;
  stopTTS?: () => void;
  playingId?: string | null;
  isTTSPlaying?: boolean;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const toggle = (i: number) => setOpenIdx(prev => (prev === i ? null : i));

  return (
    <div className="space-y-3 text-sm">
      {/* Intro paragraph */}
      {parsed.intro && (
        <p className="text-sm text-gray-800 leading-relaxed">{parsed.intro}</p>
      )}

      {/* Numbered action items — collapsible when they have body content */}
      <div className="space-y-2">
        {parsed.sections.map((section, i) => {
          const speakId = `${msgId}-em-${i}`;
          const speakText = section.body ? section.body : section.heading;

          return (
            <div key={section.num} className="border border-red-200 rounded-xl overflow-hidden">
              {section.body ? (
                <>
                  <button
                    onClick={() => toggle(i)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-red-50 hover:bg-red-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-200 text-red-700 text-xs font-bold flex items-center justify-center">
                        {section.displayNum}
                      </span>
                      <span className="text-sm font-semibold text-gray-800 break-words leading-snug">
                        {section.heading}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {onSpeak && (
                        playingId === speakId ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); stopTTS?.(); }}
                            className="w-6 h-6 rounded-full flex items-center justify-center bg-red-600 text-white animate-pulse shadow"
                            title="Stop"
                          >
                            <Square size={9} fill="white" />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); onSpeak(speakText, speakId); }}
                            disabled={isTTSPlaying}
                            className="w-6 h-6 rounded-full flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-600 disabled:opacity-40 shadow"
                            title="Listen"
                          >
                            <Volume2 size={12} />
                          </button>
                        )
                      )}
                      {openIdx === i
                        ? <ChevronDown size={16} className="text-red-400 flex-shrink-0" />
                        : <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
                      }
                    </div>
                  </button>
                  {openIdx === i && (
                    <div className="px-4 pb-4 pt-2 bg-red-50 border-t border-red-100">
                      {renderBody(section.body)}
                    </div>
                  )}
                </>
              ) : (
                /* No body — flat heading-only row with speaker */
                <div className="flex items-center justify-between gap-2 px-4 py-3 bg-red-50">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-200 text-red-700 text-xs font-bold flex items-center justify-center">
                      {section.displayNum}
                    </span>
                    <span className="text-sm font-semibold text-gray-800 break-words leading-snug">
                      {section.heading}
                    </span>
                  </div>
                  {onSpeak && (
                    playingId === speakId ? (
                      <button
                        onClick={stopTTS}
                        className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center bg-red-600 text-white animate-pulse shadow"
                        title="Stop"
                      >
                        <Square size={9} fill="white" />
                      </button>
                    ) : (
                      <button
                        onClick={() => onSpeak(section.heading, speakId)}
                        disabled={isTTSPlaying}
                        className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-600 disabled:opacity-40 shadow"
                        title="Listen"
                      >
                        <Volume2 size={12} />
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Any parsed.closing */}
      {parsed.closing && (
        <div className="space-y-1 pt-1 px-1">
          {parsed.closing.split('\n').filter(l => l.trim()).map((line, i) => (
            <p key={i} className="text-sm text-gray-700 leading-relaxed">{stripMd(line)}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

interface FormattedMessageProps {
  text: string;
  msgId?: string;
  onSpeak?: (text: string, id: string) => void;
  stopTTS?: () => void;
  playingId?: string | null;
  isTTSPlaying?: boolean;
  /** True when this message was flagged as an emergency by the backend */
  isEmergency?: boolean;
}

export function FormattedMessage({ text, msgId, onSpeak, stopTTS, playingId, isTTSPlaying, isEmergency }: FormattedMessageProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);  // all sections start collapsed

  // Single-line / short responses: skip accordion entirely → plain text + speaker button
  const nonEmptyLines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (nonEmptyLines.length <= 1) {
    const speakId = `${msgId}-single`;
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-gray-800 leading-relaxed flex-1">{stripMd(text)}</p>
        {onSpeak && (
          playingId === speakId ? (
            <button
              onClick={stopTTS}
              className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center bg-purple-600 text-white animate-pulse shadow"
              title="Stop"
            >
              <Square size={9} fill="white" />
            </button>
          ) : (
            <button
              onClick={() => onSpeak(stripMd(text), speakId)}
              disabled={isTTSPlaying}
              className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center bg-purple-100 hover:bg-purple-200 text-purple-700 disabled:opacity-40 shadow"
              title="Listen"
            >
              <Volume2 size={12} />
            </button>
          )
        )}
      </div>
    );
  }

  const parsed = parseAIResponse(text);

  // If parsing fails, fall back to plain text with markdown stripped
  if (!parsed) {
    const cleaned = stripMd(text)
      // strip leftover * used as list bullets at line start
      .replace(/^\*\s+/gm, '\u2022 ')
      // collapse 3+ newlines to 2
      .replace(/\n{3,}/g, '\n\n');
    return <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{cleaned}</p>;
  }

  // Emergency: render as action-list with red styling
  if (isEmergency) {
    return (
      <EmergencyActionList
        parsed={parsed}
        msgId={msgId}
        onSpeak={onSpeak}
        stopTTS={stopTTS}
        playingId={playingId}
        isTTSPlaying={isTTSPlaying}
      />
    );
  }

  const otcSection = parsed.sections.find(s => s.isOTC);
  const nonOtcSections = parsed.sections.filter(s => !s.isOTC);
  // The last non-OTC section (5th point) renders separately below, without a number badge
  const closingSection = nonOtcSections.length >= 2 ? nonOtcSections[nonOtcSections.length - 1] : null;
  const otherSections = closingSection ? nonOtcSections.slice(0, -1) : nonOtcSections;

  const toggle = (idx: number) =>
    setOpenIdx(prev => (prev === idx ? null : idx));

  return (
    <div className="space-y-3 text-sm">
      {/* Intro paragraph (if any) */}
      {parsed.intro && <p className="text-sm text-gray-800 leading-relaxed">{parsed.intro}</p>}

      {/* OTC featured card — always expanded, no collapse */}
      {otcSection && (
        <div className="rounded-xl border-2 border-purple-400 bg-purple-50 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 bg-purple-100 border-b border-purple-200">
            <div className="flex items-center gap-2">
              <Pill size={15} className="text-purple-600 flex-shrink-0" />
              <span className="text-sm font-bold text-purple-700">
                {otcSection.heading}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {onSpeak && (() => {
                const id = `${msgId}-otc`;
                return playingId === id ? (
                  <button onClick={stopTTS} className="w-6 h-6 rounded-full flex items-center justify-center bg-purple-600 text-white animate-pulse shadow" title="Stop">
                    <Square size={9} fill="white" />
                  </button>
                ) : (
                  <button onClick={() => onSpeak(otcSection.body, id)} disabled={isTTSPlaying} className="w-6 h-6 rounded-full flex items-center justify-center bg-purple-200 hover:bg-purple-300 text-purple-700 disabled:opacity-40 shadow" title="Listen">
                    <Volume2 size={12} />
                  </button>
                );
              })()}
              <ChevronDown size={16} className="text-purple-500 ml-1" />
            </div>
          </div>
          <div className="px-4 py-3">{renderBody(otcSection.body)}</div>
        </div>
      )}

      {/* Accordion items (all non-OTC sections) */}
      {otherSections.length > 0 && (
        <div className="space-y-2">
          {otherSections.map((section, i) => (
            <div key={section.num} className="border border-gray-200 rounded-xl overflow-hidden">
              {section.body ? (
                // Has body content — make it collapsible
                <>
                  <button
                    onClick={() => toggle(i)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center">
                        {section.displayNum}
                      </span>
                      <span className="text-sm font-semibold text-gray-800 break-words leading-snug">
                        {section.heading}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {onSpeak && (() => {
                        const id = `${msgId}-sec-${i}`;
                        return playingId === id ? (
                          <button onClick={(e) => { e.stopPropagation(); stopTTS?.(); }} className="w-6 h-6 rounded-full flex items-center justify-center bg-purple-600 text-white animate-pulse shadow" title="Stop">
                            <Square size={9} fill="white" />
                          </button>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); onSpeak(section.body, id); }} disabled={isTTSPlaying} className="w-6 h-6 rounded-full flex items-center justify-center bg-purple-100 hover:bg-purple-200 text-purple-700 disabled:opacity-40 shadow" title="Listen">
                            <Volume2 size={12} />
                          </button>
                        );
                      })()}
                      {openIdx === i
                        ? <ChevronDown size={16} className="text-purple-500 flex-shrink-0" />
                        : <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
                      }
                    </div>
                  </button>
                  {openIdx === i && (
                    <div className="px-4 pb-4 pt-1 bg-gray-50 border-t border-gray-100">
                      {renderBody(section.body)}
                    </div>
                  )}
                </>
              ) : (
                // No body — flat non-openable heading with speaker button
                <div className="flex items-center justify-between gap-2 px-4 py-3 bg-white">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center">
                      {section.displayNum}
                    </span>
                    <span className="text-sm font-semibold text-gray-800 break-words leading-snug">
                      {section.heading}
                    </span>
                  </div>
                  {onSpeak && (() => {
                    const id = `${msgId}-sec-${i}`;
                    return playingId === id ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); stopTTS?.(); }}
                        className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center bg-purple-600 text-white animate-pulse shadow"
                        title="Stop"
                      >
                        <Square size={9} fill="white" />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSpeak(section.heading, id); }}
                        disabled={isTTSPlaying}
                        className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center bg-purple-100 hover:bg-purple-200 text-purple-700 disabled:opacity-40 shadow"
                        title="Listen"
                      >
                        <Volume2 size={12} />
                      </button>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* When to see a doctor */}
      {parsed.closing && (
        <DoctorSection text={parsed.closing} />
      )}

      {/* 5th / closing section — shown separately, no number badge */}
      {closingSection && (
        <div className="mt-3 rounded-xl border border-purple-100 bg-purple-50 overflow-hidden">
          <div className="px-4 py-3">
            <p className="text-sm font-semibold text-purple-700 mb-1.5">{closingSection.heading}</p>
            {renderBody(closingSection.body)}
          </div>
        </div>
      )}
    </div>
  );
}
