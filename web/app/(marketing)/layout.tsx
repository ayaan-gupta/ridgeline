import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { SmoothScroll } from "@/components/site/motion";

import "./site.css";

/**
 * The marketing surface.
 *
 * It is a separate route group from the console on purpose. The two share the
 * colour, the three Plex faces and the frame strip, and they share nothing else:
 * this side is allowed a display face at nine rem and a page that carries
 * momentum, and the console is allowed neither.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      <SmoothScroll />
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
