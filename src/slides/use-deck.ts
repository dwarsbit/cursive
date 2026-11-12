import { useMemo, useState } from "react";
import type { Page } from "@/lib/page-file";
import { emptySlide, isPresentation, readDeck, writeDeck, type Slide } from "./deck";

/** An open presentation: its slides, the one being worked on, and what changes them. */
export interface Deck {
  title: string;
  slides: Slide[];
  /** The slide on the stage. */
  index: number;
  /** Counts the times the stage's editor has to start again from the file. */
  stamp: number;
  /** The stage starts with the caret in its slide: a slide was just made by typing. */
  focus: boolean;
  presenting: boolean;
  select: (index: number) => void;
  /** Takes what was typed on the stage's slide. */
  edit: (body: string) => void;
  /** Changes the stage's slide other than by typing in it. */
  patch: (change: Partial<Slide>) => void;
  /** Puts slides in place of the stage's slide, and shows the one at `show` of them. */
  replace: (slides: Slide[], show: number, focus?: boolean) => void;
  add: () => void;
  remove: (index: number) => void;
  move: (from: number, to: number) => void;
  present: (on: boolean) => void;
}

/**
 * The open page as a presentation, or null when it is a page of notes.
 * `key` names the open page: another page starts at slide `start`,
 * its first unless one was asked for.
 */
export function useDeck(
  page: Page | null,
  key: string | null,
  update: (change: (current: Page) => Page) => void,
  start = 0,
): Deck | null {
  const on = page !== null && isPresentation(page);
  const markdown = on ? page.markdown : "";
  const slides = useMemo(() => readDeck(markdown), [markdown]);
  const [index, setIndex] = useState(0);
  const [stamp, setStamp] = useState(0);
  const [focused, setFocused] = useState(-1);
  const [presenting, setPresenting] = useState(false);
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setIndex(start);
    setPresenting(false);
  }
  if (!on) return null;

  const at = Math.min(index, slides.length - 1);
  const write = (next: Slide[]) =>
    update((current) => ({ ...current, markdown: writeDeck(next) }));
  const show = (next: number, focus = false) => {
    setIndex(next);
    setStamp(stamp + 1);
    if (focus) setFocused(stamp + 1);
  };
  const replace = (put: Slide[], shown: number, focus = false) => {
    write([...slides.slice(0, at), ...put, ...slides.slice(at + 1)]);
    show(at + shown, focus);
  };

  return {
    title: page.title.trim(),
    slides,
    index: at,
    stamp,
    focus: focused === stamp,
    presenting,
    select: (next) => {
      if (next !== at) show(Math.max(0, Math.min(slides.length - 1, next)));
    },
    edit: (body) => {
      const current = slides[at];
      const parts = readDeck(body);
      if (parts.length === 1 && !parts[0].notes) {
        if (body.trim() !== current.body) {
          write(slides.map((slide, i) => (i === at ? { ...slide, body } : slide)));
        }
        return;
      }
      // A divider was typed, or a notes block: the slide is read again as the file has it.
      const [first, ...rest] = parts;
      replace(
        [
          { ...current, body: first.body, notes: first.notes || current.notes },
          ...rest,
        ],
        parts.length - 1,
        true,
      );
    },
    patch: (change) =>
      write(slides.map((slide, i) => (i === at ? { ...slide, ...change } : slide))),
    replace,
    add: () => {
      write([...slides.slice(0, at + 1), emptySlide(), ...slides.slice(at + 1)]);
      show(at + 1, true);
    },
    remove: (gone) => {
      const next = slides.filter((_, i) => i !== gone);
      write(next.length ? next : [emptySlide("title")]);
      show(Math.max(0, gone < at || at === next.length ? at - 1 : at));
    },
    move: (from, to) => {
      if (from === to) return;
      const next = [...slides];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      write(next);
      const follows =
        at === from
          ? to
          : from < at && to >= at
            ? at - 1
            : from > at && to <= at
              ? at + 1
              : at;
      show(follows);
    },
    present: setPresenting,
  };
}
