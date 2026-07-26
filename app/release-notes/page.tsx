import type { Metadata } from 'next';
import Link from 'next/link';
import { RELEASE_NOTES } from '@/lib/release-notes';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Release Notes — BioBib Formatter',
  description:
    'Product updates, reliability improvements, and document-quality changes for the UC San Diego BioBib Formatter.',
};

function ChangeList({ changes }: { changes: readonly string[] }) {
  return (
    <ul className={styles.changeList}>
      {changes.map((change) => (
        <li key={change}>{change}</li>
      ))}
    </ul>
  );
}

export default function ReleaseNotesPage() {
  const [latestRelease, ...earlierReleases] = RELEASE_NOTES;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Product updates</p>
        <h1>Release notes</h1>
        <p className={styles.intro}>
          Follow improvements to CV conversion, Word output quality, recovery,
          privacy, and the review workflow.
        </p>
      </header>

      <div>
        <section className={styles.latest} aria-labelledby="latest-release">
          <div className={styles.latestHeader}>
            <span className={styles.latestBadge}>Latest</span>
            <time dateTime={latestRelease.releasedAtIso}>
              {latestRelease.releasedAt}
            </time>
          </div>
          <h2 id="latest-release">{latestRelease.title}</h2>
          <ChangeList changes={latestRelease.changes} />
        </section>

        <section className={styles.history} aria-labelledby="release-history">
          <div className={styles.historyHeading}>
            <div>
              <p className={styles.eyebrow}>Changelog</p>
              <h2 id="release-history">Earlier updates</h2>
            </div>
            <p>{earlierReleases.length} releases</p>
          </div>

          <div className={styles.timeline}>
            {earlierReleases.map((release) => (
              <article className={styles.release} key={release.releasedAtIso}>
                <time dateTime={release.releasedAtIso}>{release.releasedAt}</time>
                <div className={styles.releaseBody}>
                  <h3>{release.title}</h3>
                  <ChangeList changes={release.changes} />
                </div>
              </article>
            ))}
          </div>
        </section>

        <nav className={styles.relatedLinks} aria-label="Related pages">
          <Link href="/">Convert a CV</Link>
          <Link href="/about">How BioBib Formatter works</Link>
        </nav>
      </div>
    </div>
  );
}
