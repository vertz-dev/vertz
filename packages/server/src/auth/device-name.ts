/**
 * Device name parser — simple regex-based User-Agent parsing
 */

export function parseDeviceName(userAgent: string): string {
  if (!userAgent) return 'Unknown device';

  // Browser detection
  let browser = '';
  if (/Edg\//.test(userAgent)) browser = 'Edge';
  else if (/Chrome\//.test(userAgent) && !/Chromium\//.test(userAgent)) browser = 'Chrome';
  else if (/Firefox\//.test(userAgent)) browser = 'Firefox';
  else if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) browser = 'Safari';

  // OS detection
  let os = '';
  if (/iPhone/.test(userAgent)) os = 'iPhone';
  else if (/iPad/.test(userAgent)) os = 'iPad';
  else if (/Mac OS X/.test(userAgent)) os = 'macOS';
  else if (/Windows/.test(userAgent)) os = 'Windows';
  else if (/Linux/.test(userAgent)) os = 'Linux';
  else if (/Android/.test(userAgent)) os = 'Android';

  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return os;
  return 'Unknown device';
}
