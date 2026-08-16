import Link from "next/link";

import { Wordmark } from "../Wordmark";

export function SiteFooter() {
  return (
    <footer className="sitefoot">
      <div className="sitefoot-top">
        <Wordmark />
        <p className="sitefoot-line">
          Built on the public camera network run by HPWREN at the University of California San Diego.
          Ridgeline is not affiliated with it.
        </p>
      </div>
      <div className="sitefoot-grid">
        <div>
          <span className="micro">product</span>
          <Link href="/watch">Watch floor</Link>
          <Link href="/map">Map</Link>
          <Link href="/detections">Detections</Link>
        </div>
        <div>
          <span className="micro">imagery</span>
          <a href="https://hpwren.ucsd.edu/" rel="noreferrer noopener" target="_blank">
            HPWREN
          </a>
          <a
            href="https://creativecommons.org/licenses/by-nc-nd/4.0/"
            rel="noreferrer noopener"
            target="_blank"
          >
            CC BY-NC-ND 4.0
          </a>
          <span className="sitefoot-muted">Downloaded at run time, never redistributed</span>
        </div>
        <div>
          <span className="micro">honesty</span>
          <a href="#limits">What it does not do</a>
          <span className="sitefoot-muted">Every frame on this page is a real frame</span>
          <span className="sitefoot-muted">Every number is a measurement</span>
        </div>
      </div>
      <div className="sitefoot-base">
        <span className="data-sm">Ridgeline</span>
        <span className="data-sm">San Diego County</span>
      </div>
    </footer>
  );
}
