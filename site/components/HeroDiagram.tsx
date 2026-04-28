import Image from 'next/image';
import styles from './HeroDiagram.module.css';

type Card = {
  id: string;
  label: string;
  className: string;
  rows: { k: string; v: string }[];
  status?: { kind: 'verified' | 'active' | 'enforced' | 'success'; text: string };
  pulse?: boolean;
};

let cards: Card[] = [
  {
    id: 'credential',
    label: 'Credential',
    className: 'cardTL',
    rows: [
      { k: 'Agent ID', v: 'agt_7f2e…9c8a' },
      { k: 'Issuer', v: '0xAgentio' },
    ],
    status: { kind: 'verified', text: 'Verified' },
    pulse: true,
  },
  {
    id: 'delegation',
    label: 'Delegation',
    className: 'cardTR',
    rows: [
      { k: 'From', v: 'Agent Ops' },
      { k: 'Scope', v: 'Read · Transact' },
    ],
    status: { kind: 'active', text: 'Active' },
  },
  {
    id: 'trust',
    label: 'Trust Score',
    className: 'cardML',
    rows: [
      { k: 'Score', v: '98 / 100' },
      { k: 'Tier', v: 'High Trust' },
    ],
  },
  {
    id: 'proof',
    label: 'Recent Proof',
    className: 'cardBL',
    rows: [
      { k: 'Tx', v: '0x7ab3…e7d1' },
      { k: 'Block', v: '18,732,991' },
    ],
    status: { kind: 'success', text: 'Success' },
  },
  {
    id: 'policy',
    label: 'Policy',
    className: 'cardBR',
    rows: [
      { k: 'Scope', v: 'Research agents' },
      { k: 'Rule', v: 'Least privilege' },
    ],
    status: { kind: 'enforced', text: 'Enforced' },
  },
];

export default function HeroDiagram() {
  return (
    <div className={styles.stage} aria-hidden>
      <svg
        className={styles.connectors}
        viewBox="0 0 600 600"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4f7dff" stopOpacity="0.5" />
            <stop offset="50%" stopColor="#27c2b3" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#b58dff" stopOpacity="0.5" />
          </linearGradient>
          <radialGradient id="dotGrad" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#27c2b3" />
            <stop offset="100%" stopColor="#4f7dff" />
          </radialGradient>
        </defs>

        {/* connector paths from center (300,300) to each card */}
        <path
          id="path-credential"
          d="M 300 300 C 240 230, 180 180, 110 110"
          stroke="url(#lineGrad)"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          id="path-delegation"
          d="M 300 300 C 360 230, 420 180, 490 110"
          stroke="url(#lineGrad)"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          id="path-trust"
          d="M 300 300 C 220 300, 160 300, 80 300"
          stroke="url(#lineGrad)"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          id="path-proof"
          d="M 300 300 C 240 370, 180 420, 110 490"
          stroke="url(#lineGrad)"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          id="path-policy"
          d="M 300 300 C 360 370, 420 420, 490 490"
          stroke="url(#lineGrad)"
          strokeWidth="1.5"
          fill="none"
        />

        {/* flowing dots */}
        <circle r="4" fill="url(#dotGrad)">
          <animateMotion dur="3.6s" repeatCount="indefinite" rotate="auto">
            <mpath href="#path-credential" />
          </animateMotion>
        </circle>
        <circle r="4" fill="url(#dotGrad)">
          <animateMotion dur="4.2s" repeatCount="indefinite" rotate="auto" begin="0.6s">
            <mpath href="#path-delegation" />
          </animateMotion>
        </circle>
        <circle r="3.5" fill="url(#dotGrad)">
          <animateMotion dur="5s" repeatCount="indefinite" rotate="auto" begin="1.2s">
            <mpath href="#path-trust" />
          </animateMotion>
        </circle>
        <circle r="4" fill="url(#dotGrad)">
          <animateMotion dur="3.9s" repeatCount="indefinite" rotate="auto" begin="0.3s">
            <mpath href="#path-proof" />
          </animateMotion>
        </circle>
        <circle r="4" fill="url(#dotGrad)">
          <animateMotion dur="4.6s" repeatCount="indefinite" rotate="auto" begin="0.9s">
            <mpath href="#path-policy" />
          </animateMotion>
        </circle>
      </svg>

      <div className={styles.center}>
        <div className={styles.centerGlow} />
        <Image
          src="/logo.png"
          alt=""
          width={140}
          height={140}
          priority
          className={styles.centerLogo}
        />
      </div>

      {cards.map((card) => (
        <article key={card.id} className={`${styles.card} ${styles[card.className]}`}>
          <header className={styles.cardHeader}>
            <span className={styles.cardLabel}>{card.label}</span>
            {card.status && (
              <span
                className={`${styles.badge} ${styles[`badge-${card.status.kind}`]}`}
              >
                {card.pulse && <span className={styles.pulse} />}
                {card.status.text}
              </span>
            )}
          </header>
          <ul className={styles.rows}>
            {card.rows.map((row) => (
              <li key={row.k} className={styles.row}>
                <span className={styles.rowKey}>{row.k}</span>
                <span className={styles.rowVal}>{row.v}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
