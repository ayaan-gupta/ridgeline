import Link from "next/link";

/**
 * The root 404 now sits outside both route groups, so it has to offer both
 * doors. Someone who mistyped a camera id wants the watch floor, and someone who
 * followed a stale link wants the front page.
 */
export default function NotFound() {
  return (
    <main className="page" style={{ paddingTop: 64 }}>
      <div className="empty">
        <h2>No such page</h2>
        <p>That address does not match a camera or a view in this system.</p>
        <p style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/watch" style={{ textDecoration: "underline" }}>
            Go to the watch floor
          </Link>
          <Link href="/" style={{ textDecoration: "underline" }}>
            Go to the front page
          </Link>
        </p>
      </div>
    </main>
  );
}
