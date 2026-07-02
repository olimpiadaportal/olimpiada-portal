"use client";

// Horizontal tab bar for the Settings page (Settings redesign, Round 6).
// Underline-style buttons with an active state; the tab CONTENT is rendered
// on the server and passed in as ReactNode, so this client component only
// owns which panel is visible. Inactive panels stay mounted (hidden) so
// per-field drafts survive tab switches.
import { useState, type ReactNode } from "react";

export type SettingsTab = {
  id: string;
  label: string;
  content: ReactNode;
};

export function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  return (
    <div>
      <div className="settings-tabbar" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`settings-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            aria-controls={`settings-panel-${tab.id}`}
            className={`settings-tab${active === tab.id ? " active" : ""}`}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`settings-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${tab.id}`}
          hidden={active !== tab.id}
          className="settings-panel"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
