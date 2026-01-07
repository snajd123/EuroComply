/**
 * EuroComply DPP Verification Badge - Client JavaScript
 *
 * Provides real-time verification status by:
 * 1. Fetching current verification status from app proxy
 * 2. Comparing data hashes
 * 3. Updating badge UI dynamically
 * 4. Loading QR codes asynchronously
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    proxyPath: '/apps/eurocomply/api/verify',
    qrPath: '/apps/eurocomply/api/qr',
    cacheKey: 'eurocomply_dpp_cache',
    cacheTtlMs: 60000, // 1 minute cache
    retryAttempts: 2,
    retryDelayMs: 1000,
  };

  // Status icons
  const STATUS_ICONS = {
    verified: '✓',
    modified: '⚠',
    pending: '⏳',
    revoked: '⊘',
    expired: '⏰',
    error: '✕',
    loading: '⟳',
  };

  // Status text templates
  const STATUS_TEXT = {
    verified: 'Sustainability Verified',
    modified: 'Data Modified - Re-verify Needed',
    pending: 'Verification Pending',
    revoked: 'Credential Revoked',
    expired: 'Credential Expired',
    error: 'Verification Error',
    loading: 'Verifying...',
  };

  /**
   * Initialize all DPP badges on the page
   */
  function initBadges() {
    const badges = document.querySelectorAll('.eurocomply-dpp-badge');

    badges.forEach(function(badge) {
      const dppId = badge.dataset.dppId;
      const realtime = badge.dataset.realtime === 'true';
      const style = badge.dataset.style;

      if (!dppId) return;

      // Load QR code if full widget
      if (style === 'full') {
        loadQrCode(badge, dppId);
      }

      // Perform real-time verification if enabled
      if (realtime) {
        verifyAndUpdate(badge, dppId);
      }
    });
  }

  /**
   * Fetch verification status and update badge
   */
  async function verifyAndUpdate(badgeContainer, dppId) {
    const badge = badgeContainer.querySelector('.eurocomply-badge');
    if (!badge) return;

    // Show loading state
    setStatus(badgeContainer, 'loading');

    try {
      // Check cache first
      const cached = getCache(dppId);
      if (cached) {
        applyVerificationResult(badgeContainer, cached);
        return;
      }

      // Fetch from API
      const response = await fetchWithRetry(
        `${CONFIG.proxyPath}/${dppId}`,
        CONFIG.retryAttempts
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      // Cache the result
      setCache(dppId, result);

      // Apply to UI
      applyVerificationResult(badgeContainer, result);

    } catch (error) {
      console.error('EuroComply verification error:', error);
      setStatus(badgeContainer, 'error', 'Unable to verify credential');
    }
  }

  /**
   * Apply verification result to badge UI
   */
  function applyVerificationResult(badgeContainer, result) {
    const status = result.status?.toLowerCase() || 'error';
    const message = result.message || STATUS_TEXT[status];
    const details = result.details || {};

    setStatus(badgeContainer, status, message);

    // Update hash displays
    const currentHashEl = badgeContainer.querySelector('[data-current-hash]');
    const vcHashEl = badgeContainer.querySelector('[data-vc-hash]');
    const issuedAtEl = badgeContainer.querySelector('[data-issued-at]');

    if (currentHashEl && details.dataHash) {
      currentHashEl.textContent = details.dataHash.substring(0, 12) + '...';
    }
    if (vcHashEl && details.vcDataHash) {
      vcHashEl.textContent = details.vcDataHash.substring(0, 12) + '...';
    }
    if (issuedAtEl && details.vcIssuedAt) {
      issuedAtEl.textContent = new Date(details.vcIssuedAt).toLocaleDateString();
    }

    // Update message
    const messageEl = badgeContainer.querySelector('[data-message]');
    if (messageEl) {
      messageEl.textContent = message;
    }
  }

  /**
   * Set badge status
   */
  function setStatus(badgeContainer, status, message) {
    const badge = badgeContainer.querySelector('.eurocomply-badge');
    if (!badge) return;

    // Update data attribute
    badgeContainer.dataset.status = status;

    // Remove old status classes, add new one
    badge.className = badge.className.replace(/eurocomply-badge--\w+/g, '');
    badge.classList.add('eurocomply-badge');
    badge.classList.add('eurocomply-badge--' + status);

    // Update icon
    const iconEl = badge.querySelector('[data-icon]');
    if (iconEl) {
      iconEl.textContent = STATUS_ICONS[status] || '?';
    }

    // Update text
    const textEl = badge.querySelector('[data-text]');
    if (textEl) {
      textEl.textContent = message || STATUS_TEXT[status] || status;
    }

    // Update tooltip
    badge.title = message || STATUS_TEXT[status] || '';
  }

  /**
   * Load QR code for full widget
   */
  async function loadQrCode(badgeContainer, dppId) {
    const qrTarget = badgeContainer.querySelector('[data-qr-target]');
    if (!qrTarget) return;

    try {
      const response = await fetchWithRetry(
        `${CONFIG.qrPath}/${dppId}`,
        CONFIG.retryAttempts
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.dataUrl) {
        const img = document.createElement('img');
        img.src = result.dataUrl;
        img.alt = 'Verification QR Code';
        img.style.width = '140px';
        img.style.height = '140px';
        img.style.borderRadius = '8px';
        img.style.border = '4px solid white';
        img.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';

        qrTarget.innerHTML = '';
        qrTarget.appendChild(img);
      }

    } catch (error) {
      console.error('QR code load error:', error);
      qrTarget.innerHTML = '<span style="color:#9ca3af;font-size:12px;">QR unavailable</span>';
    }
  }

  /**
   * Fetch with retry logic
   */
  async function fetchWithRetry(url, attempts) {
    for (let i = 0; i < attempts; i++) {
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
          },
          credentials: 'same-origin',
        });
        return response;
      } catch (error) {
        if (i === attempts - 1) throw error;
        await sleep(CONFIG.retryDelayMs);
      }
    }
  }

  /**
   * Simple cache helpers
   */
  function getCache(dppId) {
    try {
      const cache = JSON.parse(sessionStorage.getItem(CONFIG.cacheKey) || '{}');
      const entry = cache[dppId];
      if (entry && Date.now() - entry.timestamp < CONFIG.cacheTtlMs) {
        return entry.data;
      }
    } catch (e) {}
    return null;
  }

  function setCache(dppId, data) {
    try {
      const cache = JSON.parse(sessionStorage.getItem(CONFIG.cacheKey) || '{}');
      cache[dppId] = { data, timestamp: Date.now() };

      // Limit cache size
      const keys = Object.keys(cache);
      if (keys.length > 20) {
        delete cache[keys[0]];
      }

      sessionStorage.setItem(CONFIG.cacheKey, JSON.stringify(cache));
    } catch (e) {}
  }

  /**
   * Utility: sleep
   */
  function sleep(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }

  /**
   * Public API for manual refresh
   */
  window.EuroComplyDPP = {
    refresh: function(dppId) {
      const badge = document.querySelector('[data-dpp-id="' + dppId + '"]');
      if (badge) {
        // Clear cache
        try {
          const cache = JSON.parse(sessionStorage.getItem(CONFIG.cacheKey) || '{}');
          delete cache[dppId];
          sessionStorage.setItem(CONFIG.cacheKey, JSON.stringify(cache));
        } catch (e) {}
        // Re-verify
        verifyAndUpdate(badge, dppId);
      }
    },
    refreshAll: function() {
      const badges = document.querySelectorAll('.eurocomply-dpp-badge[data-dpp-id]');
      badges.forEach(function(badge) {
        const dppId = badge.dataset.dppId;
        if (dppId) {
          window.EuroComplyDPP.refresh(dppId);
        }
      });
    },
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBadges);
  } else {
    initBadges();
  }

  // Re-initialize on Shopify section reload (for theme editor)
  document.addEventListener('shopify:section:load', function(event) {
    const section = event.target;
    const badges = section.querySelectorAll('.eurocomply-dpp-badge');
    badges.forEach(function(badge) {
      const dppId = badge.dataset.dppId;
      if (dppId && badge.dataset.realtime === 'true') {
        verifyAndUpdate(badge, dppId);
      }
    });
  });

})();
