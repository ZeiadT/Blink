import React from 'react';
import { PenSquare, Users, Rocket } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TabId } from '@shared/types';
import styles from './Layout.module.css';

const TAB_ICONS: Record<TabId, LucideIcon> = {
  compose: PenSquare,
  groups: Users,
  campaign: Rocket,
};

const TAB_LABELS: Record<TabId, string> = {
  compose: 'Compose',
  groups: 'Groups',
  campaign: 'Campaign',
};

interface LayoutProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  badges?: Partial<Record<TabId, number | string>>;
  statusDots?: Partial<Record<TabId, 'running' | 'paused'>>;
  children: React.ReactNode;
}

const TAB_ORDER: TabId[] = ['compose', 'groups', 'campaign'];

export const Layout: React.FC<LayoutProps> = ({
  activeTab,
  onTabChange,
  badges = {},
  statusDots = {},
  children,
}) => {
  return (
    <div className={styles.layout}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.logoMark} />
          <span className={styles.logoText}>Blink</span>
        </div>
      </header>

      {/* Content */}
      <main className={styles.content}>{children}</main>

      {/* Tab Bar */}
      <nav className={styles.tabBar} role="tablist" aria-label="Main navigation">
        {TAB_ORDER.map((tabId) => {
          const Icon = TAB_ICONS[tabId];
          const isActive = activeTab === tabId;
          const badge = badges[tabId];
          const dot = statusDots[tabId];
          return (
            <button
              key={tabId}
              id={`tab-${tabId}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tabId}`}
              className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
              onClick={() => onTabChange(tabId)}
            >
              <div className={styles.tabIconWrap}>
                <Icon size={20} className={styles.tabIcon} />
                {dot && (
                  <span
                    className={`${styles.statusDot} ${dot === 'running' ? styles.dotRunning : styles.dotPaused}`}
                  />
                )}
              </div>
              <span className={styles.tabLabel}>{TAB_LABELS[tabId]}</span>
              {badge !== undefined && (
                <span className={styles.badge}>{badge}</span>
              )}
              {isActive && <div className={styles.tabIndicator} />}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

