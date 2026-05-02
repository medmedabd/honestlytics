export const getDeviceProperties = (): Record<string, unknown> => {
  if (typeof window === 'undefined') return {};

  return {
    browser: navigator.userAgent,
    screen: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
};