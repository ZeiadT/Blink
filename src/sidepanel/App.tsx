import React, { useState } from 'react';
import { Layout } from './components/shared/Layout';
import { PostComposer } from './components/PostComposer/PostComposer';
import { GroupManager } from './components/GroupManager/GroupManager';
import { ToastContainer } from './components/shared/Toast';
import type { TabId } from '@shared/types';
import styles from './App.module.css';

const CampaignPlaceholder: React.FC = () => (
  <div className={styles.placeholder}>
    <h2 className={styles.placeholderTitle}>Campaign</h2>
    <p className={styles.placeholderText}>Campaign dashboard will appear here.</p>
  </div>
);

const SettingsPlaceholder: React.FC = () => (
  <div className={styles.placeholder}>
    <h2 className={styles.placeholderTitle}>Settings</h2>
    <p className={styles.placeholderText}>Settings panel will appear here.</p>
  </div>
);

const TAB_CONTENT: Record<TabId, React.FC> = {
  compose: PostComposer,
  groups: GroupManager,
  campaign: CampaignPlaceholder,
  settings: SettingsPlaceholder,
};

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('compose');
  const ActiveContent = TAB_CONTENT[activeTab];

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      <div
        key={activeTab}
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className={styles.tabPanel}
      >
        <ActiveContent />
      </div>
      <ToastContainer />
    </Layout>
  );
};
