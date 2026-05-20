import { useEffect, useRef } from "react";
import { Terminal as XTerm, type ITerminalOptions } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import "xterm/css/xterm.css";
import { socketActions } from "../socket/bridge.js";
import { useStore } from "../store/index.js";

const TERM_OPTS: ITerminalOptions = {
  fontFamily:
    "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
  fontSize: 12,
  lineHeight: 1.2,
  cursorBlink: true,
  cursorStyle: "bar",
  scrollback: 5000,
  allowProposedApi: true,
  convertEol: true,
  theme: {
    background: "#100a14",
    foreground: "#fce4ee",
    cursor: "#f7c6d9",
    selectionBackground: "#9b517655",
    black: "#1a0e1c",
    red: "#ff7a9c",
    green: "#9be0a8",
    yellow: "#ffd97a",
    blue: "#a4c9ff",
    magenta: "#d29bff",
    cyan: "#9ed6c9",
    white: "#fff5ec",
    brightBlack: "#52404d",
    brightRed: "#ff9bb6",
    brightGreen: "#b2efbe",
    brightYellow: "#ffe5a0",
    brightBlue: "#bcd9ff",
    brightMagenta: "#e0b3ff",
    brightCyan: "#bee3da",
    brightWhite: "#ffffff",
  },
};

/**
 * Per-agent xterm instance. Hidden via CSS rather than unmounted on tab
 * switch, so scrollback is preserved.
 */
interface TerminalProps {
  agentId: string;
  visible: boolean;
}

export function Terminal({ agentId, visible }: TerminalProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const writtenRef = useRef(0);

  // Mount xterm once on first render.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || termRef.current) return;

    const term = new XTerm(TERM_OPTS);
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(host);

    // Forward user keystrokes to the agent's stdin
    term.onData((data) => socketActions.agentInput(agentId, data));

    termRef.current = term;
    fitRef.current = fit;

    // Defer fit until layout has settled, then flush any cached log lines.
    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {
        /* hidden container — fit on next show */
      }
      const lines = useStore.getState().agents[agentId]?.logLines ?? [];
      for (const l of lines) term.write(l);
      writtenRef.current = lines.length;
    });

    // Stream new lines via store subscription.
    const unsub = useStore.subscribe(() => {
      const lines = useStore.getState().agents[agentId]?.logLines ?? [];
      if (writtenRef.current < lines.length) {
        for (let i = writtenRef.current; i < lines.length; i++) {
          term.write(lines[i]!);
        }
        writtenRef.current = lines.length;
      }
    });

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* hidden container is fine */
      }
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      unsub();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [agentId]);

  // When the tab becomes visible, force a fit (xterm can't measure while hidden).
  useEffect(() => {
    if (!visible) return;
    requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
      } catch {
        /* noop */
      }
    });
  }, [visible]);

  return (
    <div
      ref={hostRef}
      className="xterm-host w-full h-full bg-[#100a14] rounded-md overflow-hidden"
      style={{ display: visible ? "block" : "none" }}
    />
  );
}
