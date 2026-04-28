'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './kv.module.css';

let RPC_URL = 'http://178.238.236.119:6789';
let GITHUB_URL = 'https://github.com/trivo25/agentio';

let fallbackStreamIds = [
  '0x000000000000000000000000000000000000000000000000000000000000f2bd',
  '0x000000000000000000000000000000000000000000000000000000000000f009',
  '0x0000000000000000000000000000000000000000000000000000000000016879',
  '0x0000000000000000000000000000000000000000000000000000000000002e3d',
];

type StatusState = 'loading' | 'online' | 'offline';

function relativeTime(iso: string): string {
  let then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  let secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return secs + 's ago';
  let mins = Math.round(secs / 60);
  if (mins < 60) return mins + 'm ago';
  let hours = Math.round(mins / 60);
  if (hours < 48) return hours + 'h ago';
  return Math.round(hours / 24) + 'd ago';
}

function CopyButton({
  value,
  primary = false,
  onCopy,
}: {
  value: string;
  primary?: boolean;
  onCopy?: () => void;
}) {
  let [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`${styles.copyBtn} ${primary ? styles.copyBtnPrimary : ''} ${
        copied ? styles.copied : ''
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function StarToast({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <div
      className={`${styles.toast} ${visible ? styles.toastVisible : ''}`}
      role="status"
      aria-live="polite"
    >
      <svg
        className={styles.toastIcon}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
      >
        <path d="M12 2.5l2.9 5.88 6.5.94-4.7 4.58 1.11 6.46L12 17.27l-5.81 3.05 1.11-6.45-4.7-4.58 6.5-.94L12 2.5z" />
      </svg>
      <span className={styles.toastText}>
        Like what we&rsquo;ve built? Give us a star on{' '}
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        .
      </span>
      <button
        type="button"
        className={styles.toastClose}
        onClick={onClose}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export default function KvStatus() {
  let [status, setStatus] = useState<StatusState>('loading');
  let [checkedAt, setCheckedAt] = useState<string | null>(null);
  let [streams] = useState<string[]>(fallbackStreamIds);
  let [toastOpen, setToastOpen] = useState(false);
  let toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pingStarToast() {
    setToastOpen(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastOpen(false), 6000);
  }

  function closeStarToast() {
    setToastOpen(false);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }

  useEffect(() => {
    fetch('status.json', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error('no status');
        return r.json();
      })
      .then((s: { online: boolean; checkedAt?: string }) => {
        setStatus(s.online ? 'online' : 'offline');
        if (s.checkedAt) setCheckedAt(s.checkedAt);
      })
      .catch(() => setStatus('online'));
  }, []);

  let statusLabel =
    status === 'loading' ? 'Checking' : status === 'online' ? 'Online' : 'Offline';

  return (
    <main className={styles.page}>
      <span className={styles.eyebrow}>
        <span className={styles.eyebrowDot} />
        Public infrastructure
      </span>
      <h1 className={styles.h1}>0G KV Storage Node</h1>
      <p className={styles.subtitle}>
        Open RPC endpoint for hackers building on 0G. Hosted by 0xAgentio while the
        public indexer doesn't expose a KV node.
      </p>

      <section className={styles.card} aria-label="RPC endpoint">
        <div className={styles.cardHeader}>
          <span className={styles.cardLabel}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <ellipse cx="12" cy="5" rx="8" ry="3" />
              <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
              <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
            </svg>
            RPC endpoint
          </span>
          <span
            className={`${styles.statusBadge} ${
              status === 'loading'
                ? styles.statusLoading
                : status === 'offline'
                  ? styles.statusOffline
                  : ''
            }`}
          >
            <span className={styles.pulse} />
            {statusLabel}
          </span>
        </div>

        <div className={styles.endpointRow}>
          <code className={styles.endpoint}>{RPC_URL}</code>
          <CopyButton value={RPC_URL} primary onCopy={pingStarToast} />
        </div>

        <div className={styles.meta}>
          <div className={styles.metaItem}>
            <div className={styles.metaKey}>Network</div>
            <div className={styles.metaVal}>0G Galileo Testnet</div>
          </div>
          <div className={styles.metaItem}>
            <div className={styles.metaKey}>Service</div>
            <div className={styles.metaVal}>KV Storage Node JSON-RPC</div>
          </div>
        </div>
      </section>

      <section className={styles.card} aria-label="Supported stream IDs">
        <div className={styles.cardHeader}>
          <span className={styles.cardLabel}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M4 7c4-3 12-3 16 0" />
              <path d="M4 12c4-3 12-3 16 0" />
              <path d="M4 17c4-3 12-3 16 0" />
            </svg>
            Supported stream IDs
          </span>
          <span className={styles.statusBadge}>
            <span className={styles.pulse} />
            {streams.length} indexed
          </span>
        </div>

        <div className={styles.streamList}>
          {streams.map((id) => (
            <div key={id} className={styles.streamRow}>
              <code className={styles.streamId}>{id}</code>
              <CopyButton value={id} />
            </div>
          ))}
        </div>
      </section>

      <p className={styles.note}>
        Set <code>AGENTIO_0G_KV_RPC</code> to the endpoint and{' '}
        <code>AGENTIO_0G_STREAM_ID</code> to one of the indexed streams above. No auth,
        no rate limits today — please be kind.
      </p>

      {checkedAt && (
        <p className={styles.note}>Last checked {relativeTime(checkedAt)}.</p>
      )}

      <p className={styles.backLink}>
        <a href="/">← Back to 0xAgentio</a>
      </p>

      <StarToast visible={toastOpen} onClose={closeStarToast} />
    </main>
  );
}
