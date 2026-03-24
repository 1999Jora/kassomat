export const formatCents = (cents: number): string =>
  (cents / 100).toLocaleString('de-AT', { style: 'currency', currency: 'EUR' });

export const formatDate = (d: Date): string =>
  d.toLocaleString('de-AT', { timeZone: 'Europe/Vienna' });

export const formatTime = (d: Date): string =>
  d.toLocaleTimeString('de-AT', { timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit' });

export const formatPercent = (value: number): string =>
  `${value}%`;

export const centsToDisplay = (cents: number): string =>
  (cents / 100).toFixed(2).replace('.', ',');

export const formatRelative = (d: Date): string => {
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  return d.toLocaleDateString('de-AT', { timeZone: 'Europe/Vienna' });
};
