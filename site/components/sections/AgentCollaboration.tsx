import styles from './AgentCollaboration.module.css';

let nodes = [
  { id: 'a', label: 'Researcher', cx: 140, cy: 140, verified: true },
  { id: 'b', label: 'Planner', cx: 360, cy: 110, verified: true },
  { id: 'c', label: 'Executor', cx: 510, cy: 220, verified: true },
  { id: 'd', label: 'Auditor', cx: 380, cy: 330, verified: true },
  { id: 'e', label: 'Unverified', cx: 200, cy: 320, verified: false },
  { id: 'f', label: 'Unverified', cx: 70, cy: 250, verified: false },
];

let edges = [
  ['a', 'b'],
  ['b', 'c'],
  ['c', 'd'],
  ['d', 'a'],
  ['b', 'd'],
];

let capabilities = [
  {
    title: 'Credential-gated peer discovery',
    body:
      'An agent announces its capabilities and credential on the mesh. Other agents discover it, verify the credential, and initiate collaboration.',
  },
  {
    title: 'Trust-weighted signals',
    body:
      'Receiving agents verify the sender\'s credential before trusting a signal, and weight it by the proven authorization level. You can\'t fake budget weight.',
  },
  {
    title: 'Mutual verification handshakes',
    body:
      'Before two agents transact bilaterally, they exchange credentials over AXL. Neither side needs to know the other\'s principal — just that they\'re credentialed.',
  },
  {
    title: 'Transport-layer filtering',
    body:
      'Unverified signals are dropped at the transport layer before reaching the application. If you can\'t prove your authority, your messages don\'t get through.',
  },
  {
    title: 'Instant authorization, no reputation needed',
    body:
      'A brand-new agent with a valid credential can participate on its first interaction — because the proof is the authorization.',
  },
];

export default function AgentCollaboration() {
  let lookup = Object.fromEntries(nodes.map((n) => [n.id, n]));

  return (
    <section className={`section ${styles.section}`}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.copy}>
          <span className="eyebrow">
            <span className="dot" /> Verified P2P coordination
          </span>
          <h2 className={`section-heading ${styles.heading}`}>
            The mesh itself is the marketplace.
          </h2>
          <p className="section-sub">
            Delegation credentials are static on their own — they need a communication
            layer to become useful. The axl adapter turns AXL into a coordination network
            where agents discover, verify, and collaborate with credentialed peers.
          </p>

          <ul className={styles.legend}>
            <li>
              <span className={`${styles.swatch} ${styles.swatchVerified}`} />
              Verified peer
            </li>
            <li>
              <span className={`${styles.swatch} ${styles.swatchMuted}`} />
              Unverified — dropped
            </li>
          </ul>
        </div>

        <div className={styles.visual}>
          <svg viewBox="0 0 600 420" className={styles.mesh} aria-hidden>
            <defs>
              <linearGradient id="meshLine" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#4f7dff" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#27c2b3" stopOpacity="0.5" />
              </linearGradient>
            </defs>

            {edges.map(([from, to]) => {
              let f = lookup[from];
              let t = lookup[to];
              return (
                <line
                  key={`${from}-${to}`}
                  x1={f.cx}
                  y1={f.cy}
                  x2={t.cx}
                  y2={t.cy}
                  stroke="url(#meshLine)"
                  strokeWidth="1.5"
                />
              );
            })}

            {nodes.map((node) => (
              <g key={node.id}>
                {node.verified && (
                  <circle
                    cx={node.cx}
                    cy={node.cy}
                    r="14"
                    fill="none"
                    stroke="rgba(39, 194, 179, 0.55)"
                    strokeWidth="1.5"
                  >
                    <animate
                      attributeName="r"
                      values="14;28;14"
                      dur="2.8s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.55;0;0.55"
                      dur="2.8s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}
                <circle
                  cx={node.cx}
                  cy={node.cy}
                  r="10"
                  fill={node.verified ? 'url(#meshLine)' : '#e5e7eb'}
                  stroke={node.verified ? '#ffffff' : '#cbd5e1'}
                  strokeWidth="2"
                  opacity={node.verified ? 1 : 0.55}
                />
                <text
                  x={node.cx}
                  y={node.cy + 30}
                  textAnchor="middle"
                  fontSize="11"
                  fontFamily="var(--font-inter), sans-serif"
                  fill={node.verified ? '#475569' : '#94a3b8'}
                  fontWeight={node.verified ? 600 : 500}
                >
                  {node.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      <div className={`container ${styles.capGrid}`}>
        {capabilities.map((cap) => (
          <div key={cap.title} className={styles.cap}>
            <h3 className={styles.capTitle}>{cap.title}</h3>
            <p className={styles.capBody}>{cap.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
