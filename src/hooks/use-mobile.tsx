import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const PHONE_BREAKPOINT = 641;

function useBreakpoint(maxWidth: number) {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia(`(max-width: ${maxWidth - 1}px)`);
    const onChange = () => setMatches(query.matches);
    query.addEventListener("change", onChange);
    onChange();
    return () => query.removeEventListener("change", onChange);
  }, [maxWidth]);

  return matches;
}

export function useIsMobile() {
  return useBreakpoint(MOBILE_BREAKPOINT);
}

/** Phone-only breakpoint for UI changes that must not affect tablet layouts. */
export function useIsPhone() {
  return useBreakpoint(PHONE_BREAKPOINT);
}
