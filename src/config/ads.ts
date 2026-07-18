// Ad Configuration
// Paste your ad network scripts here
// Then import and use in components

export const adConfig = {
  // HilltopAds
  hilltopads: {
    enabled: false, // Set to true when you have the code
    script: '', // Paste your HilltopAds script URL here
  },

  // Monetag
  monetag: {
    enabled: false,
    script: '',
  },

  // Adsterra
  adsterra: {
    enabled: false,
    script: '',
  },

  // Google AdSense
  adsense: {
    enabled: false,
    publisherId: '', // ca-pub-XXXXXXX
  },
};

// Ad placements
export const adPlacements = {
  'after-hero': { size: '728x90', provider: 'hilltopads' },
  'mid-page-1': { size: '728x90', provider: 'hilltopads' },
  'mid-page-2': { size: '300x250', provider: 'hilltopads' },
  'post-top': { size: '728x90', provider: 'hilltopads' },
  'post-bottom': { size: '728x90', provider: 'hilltopads' },
  'sidebar': { size: '300x250', provider: 'hilltopads' },
};
