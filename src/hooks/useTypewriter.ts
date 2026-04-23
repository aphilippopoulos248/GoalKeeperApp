import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_CHAR_MS = 22;

/**
 * Reveals `fullText` one character at a time. Resets when `fullText` changes.
 */
export function useTypewriter(fullText: string, charMs: number = DEFAULT_CHAR_MS) {
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const fullRef = useRef('');

  useEffect(() => {
    fullRef.current = fullText;
    if (!fullText) {
      setDisplayedText('');
      setIsComplete(false);
      return;
    }
    setDisplayedText('');
    setIsComplete(false);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      const next = fullText.slice(0, i);
      setDisplayedText(next);
      if (i >= fullText.length) {
        setIsComplete(true);
        clearInterval(id);
      }
    }, charMs);
    return () => clearInterval(id);
  }, [fullText, charMs]);

  const skipToEnd = useCallback(() => {
    const t = fullRef.current;
    if (t) {
      setDisplayedText(t);
      setIsComplete(true);
    }
  }, []);

  return { displayedText, isComplete, skipToEnd };
}
