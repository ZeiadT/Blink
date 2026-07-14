import React, { useState } from 'react';
import { Layout } from './components/shared/Layout';
import { PostComposer } from './components/PostComposer/PostComposer';
import { GroupManager } from './components/GroupManager/GroupManager';
import { CampaignDashboard } from './components/CampaignDashboard/CampaignDashboard';
import { ToastContainer } from './components/shared/Toast';
import { useGroupStore } from './store/groupStore';
import { useCampaignStore } from './store/campaignStore';
import type { TabId } from '@shared/types';
import styles from './App.module.css';

const TAB_CONTENT: Record<TabId, React.FC> = {
  compose: PostComposer,
  groups: GroupManager,
  campaign: CampaignDashboard,
};

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('compose');
  const groupCount = useGroupStore((s) => s.activeGroups.length);
  const campaignStatus = useCampaignStore((s) => s.campaign?.status);

  const ActiveContent = TAB_CONTENT[activeTab];

  // Build badge/status maps for Layout
  const badges: Partial<Record<TabId, number | string>> = {};
  if (groupCount > 0) badges.groups = groupCount;

  const statusDots: Partial<Record<TabId, 'running' | 'paused'>> = {};
  if (campaignStatus === 'running') statusDots.campaign = 'running';
  else if (campaignStatus === 'paused') statusDots.campaign = 'paused';

  return (
    <Layout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      badges={badges}
      statusDots={statusDots}
    >
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
