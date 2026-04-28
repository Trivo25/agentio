import styles from './HowItWorks.module.css';

let steps = [
  {
    n: '01',
    title: 'Delegation issuance',
    body: 'A principal defines policy constraints, signs a delegation to the agent, and the agent holds a private credential.',
  },
  {
    n: '02',
    title: 'Proof generation',
    body: 'Efficient ZK proofs attest to delegated authority, budget bounds, and policy constraints — without revealing the private inputs.',
  },
  {
    n: '03',
    title: 'Peer-to-peer verification',
    body: 'Counterparties verify the proof off-chain over AXL, or on-chain via the auto-generated Solidity verifier on any EVM chain.',
  },
  {
    n: '04',
    title: 'Onchain registry',
    body: 'Solidity contracts on 0G Chain handle credential commitment, revocation, and event logs.',
  },
  {
    n: '05',
    title: 'Persistent state',
    body: '0G Storage holds credential state, cumulative spend tracking, and audit and interaction trails.',
  },
  {
    n: '06',
    title: 'Coordinated action',
    body: 'Verified agents transact, share trust-weighted signals, or split work — gated entirely by their proven authorization.',
  },
];

export default function HowItWorks() {
  return (
    <section className={`section ${styles.section}`}>
      <div className="container">
        <div className={styles.head}>
          <span className="eyebrow">
            <span className="dot" /> The framework
          </span>
          <h2 className={`section-heading ${styles.heading}`}>
            From delegation to verified action — across the full stack.
          </h2>
          <p className="section-sub">
            A principal delegates bounded authority, the agent proves its bounds in ZK,
            the agent discovers and coordinates with verified peers over AXL, and
            counterparties verify the proof before interacting. No central authority.
          </p>
        </div>

        <ol className={styles.flow}>
          {steps.map((step, i) => (
            <li key={step.n} className={styles.step}>
              <div className={styles.num}>{step.n}</div>
              <h3 className={styles.title}>{step.title}</h3>
              <p className={styles.body}>{step.body}</p>
              {i < steps.length - 1 && (
                <span className={styles.connector} aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="M4 12h14m0 0-4-4m4 4-4 4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
