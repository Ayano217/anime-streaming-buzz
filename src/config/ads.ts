// Ad Configuration
// Paste your ad network scripts here when ready

export const adConfig = {
  hilltopads: {
    enabled: false,
    script: '',
  },
  monetag: {
    enabled: false,
    script: '',
  },
  adsterra: {
    enabled: false,
    script: '',
  },
  adsense: {
    enabled: false,
    publisherId: '',
  },
};

export const adPlacements = {
  'after-hero': { size: '728x90', provider: 'hilltopads' },
  'mid-page-1': { size: '728x90', provider: 'hilltopads' },
  'mid-page-2': { size: '300x250', provider: 'hilltopads' },
  'post-top': { size: '728x90', provider: 'hilltopads' },
  'post-bottom': { size: '728x90', provider: 'hilltopads' },
  'sidebar': { size: '300x250', provider: 'hilltopads' },
};

// This is what AdPlaceholder.astro will use directly
export const adSlots: Record<string, string> = {
  'after-hero': '',
  'mid-page-1': '',
  'mid-page-2': '',
  'post-top': '',
  'post-bottom': '',
  'sidebar': '',
};
