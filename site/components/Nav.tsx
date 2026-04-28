import Image from 'next/image';
import Link from 'next/link';
import styles from './Nav.module.css';

let GITHUB_URL = 'https://github.com/trivo25/agentio';

export default function Nav() {
  return (
    <header className={styles.nav}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="0xAgentio home">
          <Image
            src="/logo.png"
            alt=""
            width={28}
            height={28}
            priority
            className={styles.logo}
          />
          <span className={styles.wordmark}>0xAgentio</span>
        </Link>

        <nav className={styles.links} aria-label="Primary">
          <a href="#product" className={styles.link}>
            Product
          </a>
          <a
            href={`${GITHUB_URL}#readme`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            Docs
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            GitHub
          </a>
        </nav>

        <div className={styles.ctas}>
          <a
            href={`${GITHUB_URL}#readme`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost"
          >
            View on GitHub
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            Get Started
          </a>
        </div>
      </div>
    </header>
  );
}
