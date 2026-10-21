'use client';

import { useEffect, useState } from 'react';

export function useEditingViewport() {
  const [viewport, setViewport] = useState({
    height: 0,
    top: 0,
    keyboard: false,
  });
  useEffect(() => {
    const visual = window.visualViewport;
    let frame = 0;
    function update() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const mobile = window.innerWidth < 760;
        // Pinch zoom belongs to the browser; it must not be mistaken for a keyboard.
        const followsVisual =
          mobile && visual && Math.abs(visual.scale - 1) < 0.05;
        const height = followsVisual ? visual.height : window.innerHeight;
        const editing = document.activeElement?.matches(
          'input:not([type="radio"]):not([type="checkbox"]), textarea',
        );
        setViewport({
          height: mobile ? height : 0,
          top: followsVisual ? visual.offsetTop : 0,
          keyboard: !!(
            mobile &&
            editing &&
            (window.innerHeight - height > 120 || height < 520)
          ),
        });
      });
    }
    update();
    visual?.addEventListener('resize', update);
    visual?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      cancelAnimationFrame(frame);
      visual?.removeEventListener('resize', update);
      visual?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, []);
  return viewport;
}
