import { useCampaignStore } from '../store/campaignStore';
import type { CampaignStatus } from '@shared/types';

export function useCampaign() {
  const campaign = useCampaignStore((s) => s.campaign);
  const isLoading = useCampaignStore((s) => s.isLoading);
  const startCampaign = useCampaignStore((s) => s.startCampaign);
  const pauseCampaign = useCampaignStore((s) => s.pauseCampaign);
  const resumeCampaign = useCampaignStore((s) => s.resumeCampaign);
  const cancelCampaign = useCampaignStore((s) => s.cancelCampaign);
  const clearCampaign = useCampaignStore((s) => s.clearCampaign);

  const status: CampaignStatus = campaign?.status ?? 'idle';
  const isIdle = !campaign || status === 'idle';
  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isFinished = status === 'completed' || status === 'failed' || status === 'cancelled';
  const progress =
    campaign && campaign.totalGroups > 0
      ? campaign.results.length / campaign.totalGroups
      : 0;
  const successCount = campaign?.results.filter((r) => r.status === 'success').length ?? 0;
  const failedCount = campaign?.results.filter((r) => r.status === 'failed').length ?? 0;
  const skippedCount = campaign?.results.filter((r) => r.status === 'skipped').length ?? 0;

  return {
    campaign,
    status,
    isLoading,
    isIdle,
    isRunning,
    isPaused,
    isFinished,
    progress,
    successCount,
    failedCount,
    skippedCount,
    startCampaign,
    pauseCampaign,
    resumeCampaign,
    cancelCampaign,
    clearCampaign,
  };
}
