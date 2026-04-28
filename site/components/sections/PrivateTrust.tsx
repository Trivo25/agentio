import styles from './PrivateTrust.module.css';

export default function PrivateTrust() {
  return (
    <section className={`section ${styles.section}`}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.copy}>
          <span className="eyebrow">
            <span className="dot" /> What the credential proves
          </span>
          <h2 className={`section-heading ${styles.heading}`}>
            Prove what you can do — without revealing who you are.
          </h2>
          <p className="section-sub">
            ZK credentials let agents attest to delegated authority, operational bounds,
            and policy constraints without exposing the private inputs behind them.
          </p>
          <ul className={styles.bullets}>
            <li>
              <strong>&ldquo;I was delegated by a valid principal&rdquo;</strong>
              <span> — without revealing who.</span>
            </li>
            <li>
              <strong>
                &ldquo;This action is within my per-tx limit AND my cumulative spend is
                within total budget&rdquo;
              </strong>
              <span> — without revealing the exact numbers.</span>
            </li>
            <li>
              <strong>&ldquo;My actions match a signed policy hash&rdquo;</strong>
              <span> — auditable without being readable.</span>
            </li>
          </ul>
        </div>

        <div className={styles.visual}>
          <article className={styles.card}>
            <header className={styles.cardHeader}>
              <span className={styles.cardLabel}>Credential</span>
              <span className={styles.badge}>
                <span className={styles.pulse} />
                Verified
              </span>
            </header>
            <ul className={styles.rows}>
              <li className={styles.row}>
                <span className={styles.k}>Agent</span>
                <span className={styles.v}>agt_7f2e…9c8a</span>
              </li>
              <li className={styles.row}>
                <span className={styles.k}>Per-tx limit</span>
                <span className={`${styles.v} ${styles.masked}`}>•••••</span>
              </li>
              <li className={styles.row}>
                <span className={styles.k}>Total budget</span>
                <span className={`${styles.v} ${styles.masked}`}>•••••</span>
              </li>
              <li className={styles.row}>
                <span className={styles.k}>Allowed pairs</span>
                <span className={`${styles.v} ${styles.masked}`}>•••••</span>
              </li>
              <li className={styles.row}>
                <span className={styles.k}>Policy hash</span>
                <span className={styles.v}>0x9c…11</span>
              </li>
              <li className={styles.row}>
                <span className={styles.k}>Status</span>
                <span className={`${styles.v} ${styles.ok}`}>Within bounds</span>
              </li>
            </ul>
            <footer className={styles.cardFoot}>
              <span className={styles.label}>Private inputs</span>
              <span className={styles.dots}>•••••••••••</span>
            </footer>
          </article>
        </div>
      </div>
    </section>
  );
}
