import Image from 'next/image';
import styles from './Footer.module.css';

let GITHUB_URL = 'https://github.com/trivo25/agentio';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Image
            src='/logo.png'
            alt=''
            width={24}
            height={24}
            className={styles.logo}
          />
          <span className={styles.wordmark}>0xAgentio</span>
          <span className={styles.tagline}>
            Verifiable coordination for autonomous agents
          </span>
        </div>

        <div className={styles.links}>
          <a href={GITHUB_URL} target='_blank' rel='noopener noreferrer'>
            GitHub
          </a>
          <a
            href={`${GITHUB_URL}#readme`}
            target='_blank'
            rel='noopener noreferrer'
          >
            Docs
          </a>
          <a href='/kv-rpc-status'>0G KV RPC Status</a>
        </div>
      </div>
      <div className={styles.legal}>
        <span>© {new Date().getFullYear()} 0xAgentio. Open source.</span>
        <span className={styles.dot}>·</span>
        <span>Built on AXL · 0G · Noir · Uniswap</span>
      </div>
    </footer>
  );
}
