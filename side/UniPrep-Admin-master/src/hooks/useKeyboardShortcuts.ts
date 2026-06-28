// Keyboard Shortcuts Hook
// Phase 6: Enhanced accessibility and productivity

'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  action: () => void;
  description: string;
}

interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  shortcuts?: KeyboardShortcut[];
}

// Default shortcuts for analytics dashboard
// Using Alt+Shift to avoid Chrome conflicts
const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  {
    key: '?',
    shiftKey: true,
    description: 'Show keyboard shortcuts help',
    action: () => {}, // Will be overridden
  },
  {
    key: 'd',
    altKey: true,
    shiftKey: true,
    description: 'Go to main dashboard',
    action: () => {}, // Will be overridden
  },
  {
    key: 's',
    altKey: true,
    shiftKey: true,
    description: 'Go to student analytics',
    action: () => {}, // Will be overridden
  },
  {
    key: 'c',
    altKey: true,
    shiftKey: true,
    description: 'Go to content analytics',
    action: () => {}, // Will be overridden
  },
  {
    key: 'r',
    altKey: true,
    shiftKey: true,
    description: 'Go to reports',
    action: () => {}, // Will be overridden
  },
  {
    key: '/',
    description: 'Focus search/filter',
    action: () => {}, // Will be overridden
  },
  {
    key: 'Escape',
    description: 'Close modal/dialog',
    action: () => {}, // Will be overridden
  },
];

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const { enabled = true, shortcuts = [] } = options;
  const router = useRouter();

  // Combine default and custom shortcuts
  const allShortcuts = useCallback(() => {
    const defaultWithActions: KeyboardShortcut[] = [
      {
        key: '?',
        shiftKey: true,
        description: 'Show keyboard shortcuts help',
        action: () => showShortcutsHelp(),
      },
      {
        key: 'd',
        altKey: true,
        shiftKey: true,
        description: 'Go to main dashboard',
        action: () => router.push('/analytics'),
      },
      {
        key: 's',
        altKey: true,
        shiftKey: true,
        description: 'Go to student analytics',
        action: () => router.push('/analytics/students'),
      },
      {
        key: 'c',
        altKey: true,
        shiftKey: true,
        description: 'Go to content analytics',
        action: () => router.push('/analytics/content'),
      },
      {
        key: 'r',
        altKey: true,
        shiftKey: true,
        description: 'Go to reports',
        action: () => router.push('/reports'),
      },
      {
        key: '/',
        description: 'Focus search/filter',
        action: () => {
          const searchInput = document.querySelector<HTMLInputElement>(
            'input[type="search"], input[placeholder*="Search"], input[placeholder*="Filter"]'
          );
          searchInput?.focus();
        },
      },
      {
        key: 'Escape',
        description: 'Close modal/dialog',
        action: () => {
          const closeButton = document.querySelector<HTMLButtonElement>(
            '[data-close-modal], [aria-label="Close"]'
          );
          closeButton?.click();
        },
      },
    ];

    return [...defaultWithActions, ...shortcuts];
  }, [router, shortcuts]);

  // Show shortcuts help modal
  const showShortcutsHelp = useCallback(() => {
    const helpContent = allShortcuts()
      .map((shortcut) => {
        const keys = [];
        if (shortcut.ctrlKey) keys.push('Ctrl');
        if (shortcut.shiftKey) keys.push('Shift');
        if (shortcut.altKey) keys.push('Alt');
        if (shortcut.metaKey) keys.push('Cmd');
        keys.push(shortcut.key);
        return `${keys.join(' + ')}: ${shortcut.description}`;
      })
      .join('\n');

    // Create a simple modal
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
    modal.innerHTML = `
      <div class="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold text-gray-900">Keyboard Shortcuts</h2>
          <button 
            class="text-gray-400 hover:text-gray-600"
            onclick="this.closest('.fixed').remove()"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="space-y-2">
          ${allShortcuts()
            .map(
              (shortcut) => `
            <div class="flex items-center justify-between py-2 border-b border-gray-100">
              <span class="text-sm text-gray-600">${shortcut.description}</span>
              <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded">
                ${[
                  shortcut.ctrlKey && 'Ctrl',
                  shortcut.shiftKey && 'Shift',
                  shortcut.altKey && 'Alt',
                  shortcut.metaKey && 'Cmd',
                  shortcut.key,
                ]
                  .filter(Boolean)
                  .join(' + ')}
              </kbd>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close on click outside
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    // Close on Escape
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }, [allShortcuts]);

  // Handle keyboard events
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Allow Escape to blur input
        if (event.key === 'Escape') {
          target.blur();
        }
        return;
      }

      // Check if any shortcut matches
      for (const shortcut of allShortcuts()) {
        const ctrlMatch = shortcut.ctrlKey ? event.ctrlKey : !event.ctrlKey;
        const shiftMatch = shortcut.shiftKey ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.altKey ? event.altKey : !event.altKey;
        const metaMatch = shortcut.metaKey ? event.metaKey : !event.metaKey;
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();

        if (ctrlMatch && shiftMatch && altMatch && metaMatch && keyMatch) {
          event.preventDefault();
          shortcut.action();
          break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, allShortcuts]);

  return {
    shortcuts: allShortcuts(),
    showHelp: showShortcutsHelp,
  };
}

// Hook for specific page shortcuts
export function useAnalyticsShortcuts() {
  const router = useRouter();

  const shortcuts: KeyboardShortcut[] = [
    {
      key: '1',
      altKey: true,
      shiftKey: true,
      description: 'Switch to Today',
      action: () => {
        const todayButton = document.querySelector<HTMLButtonElement>(
          '[data-preset="today"]'
        );
        todayButton?.click();
      },
    },
    {
      key: '2',
      altKey: true,
      shiftKey: true,
      description: 'Switch to Last 7 Days',
      action: () => {
        const weekButton = document.querySelector<HTMLButtonElement>(
          '[data-preset="last7days"]'
        );
        weekButton?.click();
      },
    },
    {
      key: '3',
      altKey: true,
      shiftKey: true,
      description: 'Switch to Last 30 Days',
      action: () => {
        const monthButton = document.querySelector<HTMLButtonElement>(
          '[data-preset="last30days"]'
        );
        monthButton?.click();
      },
    },
    {
      key: 'e',
      altKey: true,
      shiftKey: true,
      description: 'Export current view',
      action: () => {
        const exportButton = document.querySelector<HTMLButtonElement>(
          '[data-action="export"]'
        );
        exportButton?.click();
      },
    },
    {
      key: 'p',
      altKey: true,
      shiftKey: true,
      description: 'Print current view',
      action: () => {
        window.print();
      },
    },
  ];

  return useKeyboardShortcuts({ shortcuts });
}

// Get shortcuts list for display
export function getShortcutsList(): KeyboardShortcut[] {
  return DEFAULT_SHORTCUTS;
}
