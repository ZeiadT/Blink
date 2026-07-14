import React, { useEffect, useMemo } from 'react';
import {
  Check,
  FileText,
  Info,
  ListOrdered,
  Play,
  Shuffle,
  Users,
} from 'lucide-react';
import type {
  CampaignLaunchSnapshot,
  GroupEntry,
  PostDraft,
  SavedPost,
} from '@shared/types';
import { generateId, truncate } from '@shared/utils';
import { useGroupStore } from '../../store/groupStore';
import { usePostStore } from '../../store/postStore';
import {
  CURRENT_SOURCE_ID,
  useCampaignSetupStore,
} from '../../store/campaignSetupStore';
import { Settings } from '../Settings/Settings';
import { Button } from '../shared/Button';
import styles from './CampaignSetup.module.css';

interface CampaignSetupProps {
  loading: boolean;
  onStart: (
    postDraft: PostDraft,
    groups: GroupEntry[],
    launch: CampaignLaunchSnapshot,
  ) => Promise<void>;
}

function templateOptionLabel(post: SavedPost): string {
  const updated = new Date(post.updatedAt).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
  const media = post.mediaFiles.length === 0 ? 'no media' : `${post.mediaFiles.length} media`;
  return `${post.title} — ${updated}, ${media}`;
}

export const CampaignSetup: React.FC<CampaignSetupProps> = ({ loading, onStart }) => {
  const draft = usePostStore((state) => state.draft);
  const savedPosts = usePostStore((state) => state.savedPosts);
  const postsLoaded = usePostStore((state) => state.isLoaded);
  const loadDraft = usePostStore((state) => state.loadDraft);
  const activeGroups = useGroupStore((state) => state.activeGroups);
  const collections = useGroupStore((state) => state.savedLists);
  const groupsLoaded = useGroupStore((state) => state.isLoaded);
  const hydrateCatalog = useGroupStore((state) => state.hydrateCatalog);
  const postSourceId = useCampaignSetupStore((state) => state.postSourceId);
  const groupSourceId = useCampaignSetupStore((state) => state.groupSourceId);
  const randomizeGroupOrder = useCampaignSetupStore((state) => state.randomizeGroupOrder);
  const setPostSourceId = useCampaignSetupStore((state) => state.setPostSourceId);
  const setGroupSourceId = useCampaignSetupStore((state) => state.setGroupSourceId);
  const setRandomizeGroupOrder = useCampaignSetupStore(
    (state) => state.setRandomizeGroupOrder,
  );

  useEffect(() => {
    if (!postsLoaded) void loadDraft();
    if (!groupsLoaded) void hydrateCatalog();
  }, [groupsLoaded, hydrateCatalog, loadDraft, postsLoaded]);

  const selectedTemplate = useMemo(
    () =>
      postSourceId === CURRENT_SOURCE_ID
        ? null
        : savedPosts.find((post) => post.id === postSourceId),
    [postSourceId, savedPosts],
  );
  const selectedCollection = useMemo(
    () =>
      groupSourceId === CURRENT_SOURCE_ID
        ? null
        : collections.find((collection) => collection.id === groupSourceId),
    [collections, groupSourceId],
  );

  const postSourceMissing =
    postSourceId !== CURRENT_SOURCE_ID && selectedTemplate === undefined;
  const groupSourceMissing =
    groupSourceId !== CURRENT_SOURCE_ID && selectedCollection === undefined;
  const selectedPost = postSourceId === CURRENT_SOURCE_ID ? draft : selectedTemplate;
  const selectedGroups =
    groupSourceId === CURRENT_SOURCE_ID ? activeGroups : selectedCollection?.groups;
  const hasPost = Boolean(
    selectedPost &&
      (selectedPost.text.trim().length > 0 || selectedPost.mediaFiles.length > 0),
  );
  const hasGroups = Boolean(selectedGroups && selectedGroups.length > 0);
  const ready = postsLoaded && groupsLoaded && hasPost && hasGroups && !loading;

  const postLabel =
    postSourceId === CURRENT_SOURCE_ID
      ? 'Current post draft'
      : (selectedTemplate?.title ?? 'Unavailable post template');
  const groupLabel =
    groupSourceId === CURRENT_SOURCE_ID
      ? 'Current working groups'
      : (selectedCollection?.name ?? 'Unavailable group collection');

  const handleStart = async () => {
    if (!ready || !selectedPost || !selectedGroups) return;
    const now = Date.now();
    const postDraft: PostDraft = {
      id: generateId(),
      text: selectedPost.text,
      mediaFiles: selectedPost.mediaFiles.map((media) => ({ ...media })),
      createdAt: now,
      updatedAt: now,
    };
    const launch: CampaignLaunchSnapshot = {
      postSource: {
        kind: postSourceId === CURRENT_SOURCE_ID ? 'current' : 'saved',
        ...(postSourceId === CURRENT_SOURCE_ID ? {} : { id: postSourceId }),
        label: postLabel,
      },
      groupSource: {
        kind: groupSourceId === CURRENT_SOURCE_ID ? 'current' : 'saved',
        ...(groupSourceId === CURRENT_SOURCE_ID ? {} : { id: groupSourceId }),
        label: groupLabel,
      },
      randomizeGroupOrder,
    };
    await onStart(postDraft, selectedGroups.map((group) => ({ ...group })), launch);
  };

  return (
    <div className={styles.setup} aria-labelledby="campaign-setup-title">
      <header className={styles.hero}>
        <span className={styles.eyebrow}>Launch manifest</span>
        <h2 id="campaign-setup-title">Prepare campaign</h2>
        <p>Choose saved sources, set pacing, then review one launch summary.</p>
      </header>

      <section className={styles.step} aria-labelledby="post-source-title">
        <div className={styles.stepHeading}>
          <span className={styles.stepNumber}>01</span>
          <FileText size={16} aria-hidden="true" />
          <div>
            <h3 id="post-source-title">Post source</h3>
            <p>Template selection stays separate from current draft.</p>
          </div>
        </div>
        <label className={styles.field} htmlFor="campaign-post-source">
          <span>Post template</span>
          <select
            id="campaign-post-source"
            value={postSourceId}
            onChange={(event) => setPostSourceId(event.target.value)}
            disabled={!postsLoaded || loading}
          >
            <option value={CURRENT_SOURCE_ID}>
              Current post draft — {draft.text.length.toLocaleString()} chars, {draft.mediaFiles.length} media
            </option>
            {postSourceMissing ? <option value={postSourceId}>Unavailable post template</option> : null}
            {savedPosts.map((post) => (
              <option key={post.id} value={post.id}>{templateOptionLabel(post)}</option>
            ))}
          </select>
        </label>
        {postSourceMissing ? (
          <p className={styles.error} role="alert">
            Selected post template was deleted. Choose another template or current draft.
          </p>
        ) : !hasPost ? (
          <p className={styles.guidance}>Current selection is empty. Add content in Compose or choose a post template.</p>
        ) : (
          <div className={styles.sourcePreview}>
            <Check size={14} aria-hidden="true" />
            <span>{truncate(selectedPost?.text.trim() || 'Media-only post', 88)}</span>
            <strong>{selectedPost?.mediaFiles.length ?? 0} media</strong>
          </div>
        )}
      </section>

      <section className={styles.step} aria-labelledby="group-source-title">
        <div className={styles.stepHeading}>
          <span className={styles.stepNumber}>02</span>
          <Users size={16} aria-hidden="true" />
          <div>
            <h3 id="group-source-title">Target source</h3>
            <p>Collections stay unchanged when selected.</p>
          </div>
        </div>
        <label className={styles.field} htmlFor="campaign-group-source">
          <span>Group collection</span>
          <select
            id="campaign-group-source"
            value={groupSourceId}
            onChange={(event) => setGroupSourceId(event.target.value)}
            disabled={!groupsLoaded || loading}
          >
            <option value={CURRENT_SOURCE_ID}>Current working groups — {activeGroups.length} groups</option>
            {groupSourceMissing ? <option value={groupSourceId}>Unavailable group collection</option> : null}
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name} — {collection.groups.length} groups
              </option>
            ))}
          </select>
        </label>
        {groupSourceMissing ? (
          <p className={styles.error} role="alert">
            Selected group collection was deleted. Choose another collection or current groups.
          </p>
        ) : !hasGroups ? (
          <p className={styles.guidance}>Current selection has no groups. Add groups or create a collection in Groups.</p>
        ) : (
          <div className={styles.sourcePreview}>
            <Check size={14} aria-hidden="true" />
            <span>{groupLabel}</span>
            <strong>{selectedGroups?.length ?? 0} groups</strong>
          </div>
        )}
      </section>

      <section className={styles.step} aria-labelledby="campaign-pacing-title">
        <div className={styles.stepHeading}>
          <span className={styles.stepNumber}>03</span>
          <ListOrdered size={16} aria-hidden="true" />
          <div>
            <h3 id="campaign-pacing-title">Pacing and retries</h3>
            <p>Defaults save locally; running campaigns keep this snapshot.</p>
          </div>
        </div>
        <Settings showAbout={false} embedded />
      </section>

      <section className={styles.step} aria-labelledby="campaign-order-title">
        <div className={styles.stepHeading}>
          <span className={styles.stepNumber}>04</span>
          <Shuffle size={16} aria-hidden="true" />
          <div>
            <h3 id="campaign-order-title">Group order</h3>
            <p>Shuffle once at launch; chosen order stays fixed through resume.</p>
          </div>
        </div>
        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={randomizeGroupOrder}
            onChange={(event) => setRandomizeGroupOrder(event.target.checked)}
            disabled={loading}
          />
          <span className={styles.toggleTrack} aria-hidden="true"><span /></span>
          <span>
            <strong>Randomize group order</strong>
            <small>{randomizeGroupOrder ? 'Groups will be shuffled once.' : 'Saved collection order will be used.'}</small>
          </span>
        </label>
      </section>

      <section className={styles.manifest} aria-labelledby="launch-review-title">
        <div className={styles.manifestHeading}>
          <span>Ready check</span>
          <h3 id="launch-review-title">{ready ? 'Campaign ready' : 'Campaign needs attention'}</h3>
        </div>
        <dl>
          <div><dt>Post</dt><dd>{postLabel}</dd></div>
          <div><dt>Targets</dt><dd>{groupLabel}</dd></div>
          <div><dt>Order</dt><dd>{randomizeGroupOrder ? 'Randomized once' : 'Collection order'}</dd></div>
        </dl>
        <Button
          variant="primary"
          size="lg"
          icon={Play}
          onClick={() => void handleStart()}
          disabled={!ready}
          loading={loading}
          fullWidth
        >
          Start posting
        </Button>
      </section>

      <details className={styles.about}>
        <summary><Info size={14} aria-hidden="true" /> About Blink</summary>
        <p>Blink uses your authenticated browser session. Saved campaign data stays on this device.</p>
      </details>
    </div>
  );
};
