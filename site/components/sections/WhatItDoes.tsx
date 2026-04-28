import styles from './WhatItDoes.module.css';

let primitives = [
  {
    title: 'Provable delegation',
    body:
      'Agents carry ZK credentials — zero-knowledge proofs that attest to their delegated authority, operational bounds, and policy constraints without revealing private inputs. The agent doesn\'t need to prove who it is to every counterparty — it proves what it\'s allowed to do.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    title: 'Verified P2P coordination',
    body:
      'The axl adapter turns AXL into a coordination network where agents discover, verify, and collaborate with credentialed peers. No marketplace or directory needed — the mesh itself is the marketplace.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="2.5" />
        <circle cx="4" cy="6" r="2" />
        <circle cx="20" cy="6" r="2" />
        <circle cx="4" cy="18" r="2" />
        <circle cx="20" cy="18" r="2" />
        <path d="m9.8 10.5-4-3" />
        <path d="m14.2 10.5 4-3" />
        <path d="m9.8 13.5-4 3" />
        <path d="m14.2 13.5 4 3" />
      </svg>
    ),
  },
  {
    title: 'Domain-agnostic infrastructure',
    body:
      'The same delegation + coordination stack applies anywhere agents need to prove what they\'re authorized to do, discover verified peers, and coordinate autonomously. Trading, compute delegation, data marketplaces, API access — different credential types, same infrastructure.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
];

export default function WhatItDoes() {
  return (
    <section className={`section ${styles.section}`}>
      <div className="container">
        <div className={styles.head}>
          <span className="eyebrow">
            <span className="dot" /> Primitives
          </span>
          <h2 className={`section-heading ${styles.heading}`}>
            Identity tells you <em className={styles.em}>who</em>. 0xAgentio answers{' '}
            <em className={styles.em}>what</em>, <em className={styles.em}>how much</em>,
            and <em className={styles.em}>with whom</em>.
          </h2>
          <p className="section-sub">
            AI agents are becoming economic actors — trading, paying for compute,
            settling API calls. a16z calls this the &ldquo;Know Your Agent&rdquo; gap.
            0xAgentio is the operational layer agents need to act autonomously: ZK proofs
            make it possible to prove all of this without revealing any of it.
          </p>
        </div>

        <div className={styles.grid}>
          {primitives.map((p) => (
            <article key={p.title} className={styles.card}>
              <div className={styles.icon} aria-hidden>
                {p.icon}
              </div>
              <h3 className={styles.title}>{p.title}</h3>
              <p className={styles.body}>{p.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
