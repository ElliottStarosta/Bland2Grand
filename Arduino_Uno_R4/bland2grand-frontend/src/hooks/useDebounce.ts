// Delays value updates until typing pauses. Used to prevent excessive search queries while the user is still typing.

import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  
  useEffect(() => {
    // Wait for the delay period before updating the debounced value
    const t = setTimeout(() => setDebounced(value), delay);
    // Cancel if value changes again before delay completes
    return () => clearTimeout(t);
  }, [value, delay]);
  
  return debounced;
}