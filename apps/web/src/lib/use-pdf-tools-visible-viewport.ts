'use client';
import { useEffect } from 'react';

export function usePdfToolsVisibleViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const height = root.style.getPropertyValue('--pdf-v2-visible-height');
    const top = root.style.getPropertyValue('--pdf-v2-visible-top');
    let frame = 0;
    const update = () => {
      const workspace = document.querySelector<HTMLElement>(
        '[data-pdf-v2-workspace]',
      );
      if (innerWidth <= 760 && Math.abs(viewport.scale - 1) < 0.01) {
        root.style.setProperty(
          '--pdf-v2-visible-height',
          `${viewport.height}px`,
        );
        root.style.setProperty(
          '--pdf-v2-visible-top',
          `${viewport.offsetTop}px`,
        );
        const keyboard =
          innerHeight - viewport.height > 120 &&
          (document.activeElement instanceof HTMLInputElement ||
            document.activeElement instanceof HTMLTextAreaElement);
        if (workspace) workspace.dataset.keyboard = String(keyboard);
        if (keyboard) {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() =>
            (document.activeElement as HTMLElement)?.scrollIntoView({
              block: 'nearest',
            }),
          );
        }
      } else {
        root.style.removeProperty('--pdf-v2-visible-height');
        root.style.removeProperty('--pdf-v2-visible-top');
        if (workspace) delete workspace.dataset.keyboard;
      }
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      if (height) root.style.setProperty('--pdf-v2-visible-height', height);
      else root.style.removeProperty('--pdf-v2-visible-height');
      if (top) root.style.setProperty('--pdf-v2-visible-top', top);
      else root.style.removeProperty('--pdf-v2-visible-top');
    };
  }, []);
}
