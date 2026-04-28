import HeroDiagram from './HeroDiagram';
import styles from './Hero.module.css';

let GITHUB_URL = 'https://github.com/trivo25/agentio';

export default function Hero() {
  return (
    <section id="product" className={styles.hero}>
      <div className={styles.inner}>
        <div className={styles.copy}>
          <a href="/kv-rpc-status/" className={styles.announce}>
            <span className={styles.announceLive}>
              <span className={styles.announcePulse} />
              Now live
            </span>
            <span className={styles.announceText}>0G KV Storage Node</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.announceArrow}
              aria-hidden
            >
              <path d="M5 12h14" />
              <path d="m13 5 7 7-7 7" />
            </svg>
          </a>

          <span className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            Proof-carrying agent coordination
          </span>

          <h1 className={styles.headline}>
            Verifiable coordination for{' '}
            <span className={styles.gradientText}>autonomous agents</span>.
          </h1>

          <p className={styles.body}>
            A framework for proof-carrying agent coordination. Delegate bounded
            authority, coordinate peer-to-peer, and verify actions at the edge — without
            forcing principals to expose private strategy, budgets, or internal
            authorization.
          </p>

          <div className={styles.actions}>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              Get Started
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M5 12h14" />
                <path d="m13 5 7 7-7 7" />
              </svg>
            </a>
            <a
              href={`${GITHUB_URL}#readme`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
            >
              View on GitHub
            </a>
          </div>

          <ul className={styles.tags}>
            <li>Provable delegation</li>
            <li>·</li>
            <li>Verified P2P coordination</li>
            <li>·</li>
            <li>ZK-credentialed agents</li>
          </ul>
        </div>

        <div className={styles.visual}>
          <HeroDiagram />
        </div>
      </div>
    </section>
  );
}
